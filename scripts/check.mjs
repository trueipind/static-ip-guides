// Lint the guides against CONTRIBUTING.md. Run: node scripts/check.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "guides");
const FOOTER = "_Maintained by [TrueIP](https://www.trueip.in/?utm_source=github&utm_medium=guides). Last checked 31 October 2026._";
const BANNED = /\bdelve|dive in|let's explore|seamless|\brobust|leverag|\bunlock|game-changer|\bcrucial|\bpivotal|streamline|\bempower|\bharness|\belevate|\brealm\b|tapestry|it's important to note|in conclusion|fast-paced|whether you're a|look no further|not only\b[^.]*\bbut also|^#+ *(conclusion|final thoughts)/im;

const problems = [];
const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
for (const f of files) {
  const p = (m) => problems.push(`${f}: ${m}`);
  const md = readFileSync(path.join(DIR, f), "utf8");
  const prose = md.replace(/```[\s\S]*?```/g, ""); // headings/links outside code only
  if (!/^\d{2}-[a-z0-9-]+\.md$/.test(f)) p("bad filename");
  if (!/^# \S/.test(md)) p("must start with '# Title'");
  if ((prose.match(/^# /gm) || []).length !== 1) p("exactly one H1");
  if (!/^## Using a dedicated static IP\s*$/m.test(prose)) p("missing '## Using a dedicated static IP'");
  if (!/^## Sources\s*$/m.test(prose)) p("missing '## Sources'");
  if (md.trimEnd().split("\n").at(-1) !== FOOTER) p("last line must be the footer");
  if (/[–—]/.test(md)) p("em/en dash");
  const ban = md.match(BANNED);
  if (ban) p(`banned phrase "${ban[0]}"`);
  for (const [, url] of md.matchAll(/\]\((https?:\/\/(?:www\.)?trueip\.in[^)]*)\)/g))
    if (!url.includes("utm_source=github&utm_medium=guides")) p(`trueip link without UTM: ${url}`);
  for (const [, rel] of md.matchAll(/\]\(((?!https?:|#|mailto:)[^)#]+)(?:#[^)]*)?\)/g))
    if (!existsSync(path.join(DIR, rel)) && !existsSync(path.join(ROOT, rel))) p(`broken relative link: ${rel}`);
  // credentials in any URL (scheme://user:pass@host) must be the placeholders
  for (const [m] of md.matchAll(/[a-z0-9]+:\/\/[^\s/@"'`]+:[^\s/@"'`]+@[^\s"'`)]+/gi))
    if (!/:\/\/(%s:%s@|\[?user:|\{\w+\}:\{\w+\}@|\$\{?\w+\}?:\$\{?\w+\}?@)/i.test(m)) p(`non-placeholder credentials in URL: ${m}`);
  const words = prose.split(/\s+/).filter(Boolean).length;
  if (words < 450 || words > 1300) p(`prose words ${words} (aim 500-1100)`);
}
console.log(`${files.length} guides checked`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("all good");
