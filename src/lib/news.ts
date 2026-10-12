import { XMLParser } from "fast-xml-parser";

export type Article = {
  url: string;
  title: string;
  source: string | null;
  publishedAt: string | null;
  snippet: string;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

// Trigger vocabulary — pulls in articles about the events Arjun cares about.
const TRIGGER_TERMS =
  '(hiring OR hire OR jobs OR headcount OR appoints OR appointed OR CHRO OR "chief people officer" OR ' +
  '"VP operations" OR "head of HR" OR funding OR raises OR IPO OR expansion OR "new stores" OR ' +
  'workforce OR attrition OR layoffs OR strike OR digitisation OR digitalisation OR automation)';

function googleNewsUrl(query: string) {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchFeed(query: string): Promise<Article[]> {
  const res = await fetch(googleNewsUrl(query), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalMonitor/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google News RSS ${res.status} for "${query}"`);
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const raw = parsed?.rss?.channel?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((it: Record<string, unknown>) => {
    const src = it.source as { "#text"?: string } | string | undefined;
    const source = typeof src === "string" ? src : src?.["#text"] ?? null;
    let title = String(it.title ?? "");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return {
      url: String(it.link ?? ""),
      title,
      source,
      publishedAt: it.pubDate ? new Date(String(it.pubDate)).toISOString() : null,
      snippet: stripHtml(String(it.description ?? "")).slice(0, 300),
    };
  });
}

/** Recent news for one account: a broad query plus a trigger-focused one, de-duplicated. */
export async function fetchAccountNews(newsQuery: string, max = 15): Promise<Article[]> {
  const feeds = await Promise.allSettled([
    fetchFeed(`${newsQuery} when:7d`),
    fetchFeed(`${newsQuery} ${TRIGGER_TERMS} when:14d`),
  ]);
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const f of feeds) {
    if (f.status !== "fulfilled") continue;
    for (const a of f.value) {
      const key = a.title.toLowerCase();
      if (!a.url || seen.has(a.url) || seen.has(key)) continue;
      seen.add(a.url);
      seen.add(key);
      out.push(a);
    }
  }
  if (out.length === 0 && feeds.every((f) => f.status === "rejected")) {
    throw (feeds[0] as PromiseRejectedResult).reason;
  }
  return out
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, max);
}
