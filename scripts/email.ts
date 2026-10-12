// Local runner: `npx tsx --conditions=react-server --env-file=.env.local scripts/email.ts`
import { sendHotList } from "../src/lib/hotlist";
sendHotList().then((r) => console.log("sent", r)).catch((e) => console.log("ERROR", e.message));
