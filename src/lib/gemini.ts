import "server-only";
import { GoogleGenAI } from "@google/genai";
import { GEMINI_FALLBACKS, GEMINI_MODEL, PRODUCT_PITCH, SIGNAL_TYPES, type SignalType } from "./config";
import type { Article } from "./news";

let ai: GoogleGenAI | null = null;
function client() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY must be set");
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

export type Classified = {
  index: number;
  about_company: boolean;
  is_trigger: boolean;
  signal_type: SignalType;
  strength: number;
  summary: string;
};

export type Analysis = {
  articles: Classified[];
  outreach_angle: string | null;
};

const schema = {
  type: "object",
  properties: {
    articles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          about_company: {
            type: "boolean",
            description: "True only if the article is genuinely about this specific company (not a namesake or passing mention).",
          },
          is_trigger: {
            type: "boolean",
            description: "True if this event makes a workforce-management product relevant right now.",
          },
          signal_type: { type: "string", enum: [...SIGNAL_TYPES] },
          strength: {
            type: "integer",
            minimum: 0,
            maximum: 10,
            description: "0 = irrelevant, 10 = textbook buying trigger (e.g. new CHRO + 5,000 hires announced).",
          },
          summary: { type: "string", description: "One line, max 20 words: what changed at the company." },
        },
        required: ["index", "about_company", "is_trigger", "signal_type", "strength", "summary"],
      },
    },
    outreach_angle: {
      type: ["string", "null"],
      description:
        "2–3 sentences Arjun can adapt into a first message. Name the specific trigger, connect it to a concrete product capability, end with a soft ask. Null if there are no triggers.",
    },
  },
  required: ["articles", "outreach_angle"],
};

function buildPrompt(company: string, stage: string, articles: Article[], recent: string[]) {
  const list = articles
    .map(
      (a, i) =>
        `[${i}] ${a.title}\n    source: ${a.source ?? "unknown"} | published: ${a.publishedAt ?? "unknown"}\n    ${a.snippet}`,
    )
    .join("\n");
  return `You are a B2B sales-intelligence analyst for Arjun, an enterprise account executive in India.

PRODUCT
${PRODUCT_PITCH}

ACCOUNT: ${company}  (deal stage: ${stage})

A trigger event is anything that makes this product relevant to the account *right now*:
- headcount_expansion: hiring drives, new headcount targets, large onboarding
- leadership_hire: a new CHRO, CPO/Chief People Officer, VP/Head of Operations or HR joining
- digitalisation: public statements about workforce digitalisation, HR-tech or ops automation
- funding: a funding round, IPO or capital raise (usually precedes team growth)
- operational_challenge: attrition, absenteeism, labour disputes, compliance trouble, overtime, rostering failures
- expansion: new stores, warehouses, hubs, hospitals, cities (implies new frontline staff)
- other: about the company but not a workforce trigger (strength ≤ 3)

Already-known recent signals for this account (do not double count, but use for the angle):
${recent.length ? recent.map((s) => `- ${s}`).join("\n") : "- none"}

NEW ARTICLES TO CLASSIFY
${list}

Classify every article by its [index]. Be strict: stock-price chatter, product launches unrelated to staff,
and namesake companies are not triggers. Then, if any article or known signal is a real trigger, write the
outreach_angle tailored to the deal stage (${stage}): ${
    stage === "customer"
      ? "this is an existing customer — frame it as an expansion/upsell."
      : stage === "pilot"
        ? "a pilot is live — frame it as a reason to convert or widen the pilot."
        : "frame it as a timely first conversation."
  } Do not invent facts beyond the articles.`;
}

const MODELS = [GEMINI_MODEL, ...GEMINI_FALLBACKS.filter((m) => m !== GEMINI_MODEL)];

/** Try each Flash model in turn; back off and retry on rate limits. */
async function withRetry<T>(fn: (model: string) => Promise<T>, rounds = 3): Promise<T> {
  let lastErr: unknown;
  for (let round = 0; round < rounds; round++) {
    for (const model of MODELS) {
      try {
        return await fn(model);
      } catch (err) {
        lastErr = err;
        const msg = String((err as Error)?.message ?? err);
        if (!/429|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|500|404|NOT_FOUND/i.test(msg)) throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 3000 * 2 ** round));
  }
  throw lastErr;
}

export async function analyseAccount(
  company: string,
  stage: string,
  articles: Article[],
  recentSignals: string[],
): Promise<Analysis> {
  const res = await withRetry((model) =>
    client().models.generateContent({
      model,
      contents: buildPrompt(company, stage, articles, recentSignals),
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        temperature: 0.2,
      },
    }),
  );
  const parsed = JSON.parse(res.text ?? "{}") as Analysis;
  return {
    articles: (parsed.articles ?? []).filter((a) => a.index >= 0 && a.index < articles.length),
    outreach_angle: parsed.outreach_angle?.trim() || null,
  };
}

/** Refresh the angle when there are no new articles but the known signals changed relevance. */
export async function draftAngle(company: string, stage: string, recentSignals: string[]): Promise<string | null> {
  if (recentSignals.length === 0) return null;
  const res = await withRetry((model) =>
    client().models.generateContent({
      model,
      contents: `${PRODUCT_PITCH}\n\nAccount: ${company} (stage: ${stage}). Recent trigger events:\n${recentSignals
        .map((s) => `- ${s}`)
        .join("\n")}\n\nWrite a 2–3 sentence outreach angle Arjun can adapt: name the trigger, tie it to one concrete product capability, end with a soft ask. Plain text only.`,
      config: { temperature: 0.3 },
    }),
  );
  return res.text?.trim() || null;
}
