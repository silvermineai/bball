import fs from "node:fs";
import path from "node:path";
import WomensRecruiting from "./WomensRecruiting";
import { validateWomensRecruitingHistory, validateWomensRecruitingRelease } from "../../_lib/womens-recruiting-intel";

export const metadata = {
  title: "Women’s basketball recruiting",
  description: "Source-native women’s basketball prospect records with retained release receipts.",
};

export default function Page() {
  const releasePath = path.join(process.cwd(), "public/data/basketball/womens-recruiting.json");
  const raw = JSON.parse(fs.readFileSync(releasePath, "utf8")) as unknown;
  const release = validateWomensRecruitingRelease(raw);
  if (!release) {
    return <div className="page-title"><div className="eyebrow">Women&apos;s basketball · recruiting</div><h1>Recruiting release unavailable.</h1><p>The retained women&apos;s prospect file failed its identity, timestamp or receipt checks and is withheld.</p></div>;
  }
  let history = null;
  const historyPath = path.join(process.cwd(), "public/data/basketball/womens-recruiting-history.json");
  if (fs.existsSync(historyPath)) {
    try {
      history = validateWomensRecruitingHistory(JSON.parse(fs.readFileSync(historyPath, "utf8")) as unknown);
    } catch {
      history = null;
    }
  }
  return <WomensRecruiting release={release} history={history} />;
}
