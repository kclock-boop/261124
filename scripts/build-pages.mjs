import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [destination, basePath = "/261124/", access] = process.argv.slice(2);
if (!destination || !/^\/(?:[\w.-]+\/)*$/.test(basePath) || (access && access !== "--private-site")) {
  throw new Error("Usage: node scripts/build-pages.mjs <destination> [basePath] [--private-site]");
}

const targets = new Map([
  ["portal.html", "index.html"],
  ["index.html", "documents.html"],
  ...[
    "portal.css", "portal.js", "desk-data.js", "desk.css", "desk.js",
    "modules/desk.html", "modules/safety.html", "modules/moyang.html",
    "modules/review.html", "modules/folder.html", "tool-v2.css", "review.js", "folder.js",
    "styles.css", "app.js", "sw.js", "manifest.webmanifest", "favicon.svg",
    "icon-192.png", "icon-512.png"
  ].map(name => [name, name])
]);

const routes = new Map([
  ...[...targets.values()].map(name => ["/" + name, basePath + name]),
  ["/", basePath],
  ["/documents", basePath + "documents.html"]
]);

function publicContent(source, text) {
  if (source === "portal.html") {
    text = text.replace(/^[ \t]*<a class="reference"[^\r\n]*\r?\n/m, "");
  }
  if (source === "modules/review.html" && access !== "--private-site") {
    text = text.replace(/^[ \t]*<a [^\r\n]*data-shared-source[^\r\n]*\r?\n/m, "");
  }
  if (source === "index.html") {
    text = text.replace("<body>", '<body data-pages-preview>')
      .replace('id="generate"', 'id="generate" disabled')
      .replace(/(<p class="privacy">[^\r\n]*?<span>)[^<]*/, "$1공개 화면에서는 문서를 직접 작성하고 저장할 수 있습니다. AI 초안 작성은 로컬 실행에서 사용할 수 있습니다.");
  }
  if (source === "sw.js") {
    text = text.replace("taehwa-document-workspace-", "taehwa-pages-" + basePath + "-");
  }
  const sharedLink = /chatgpt\.com\/s\//i.test(text);
  const allowSourceLink = source === "modules/review.html" && access === "--private-site";
  if ((sharedLink && !allowSourceLink) || /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}/i.test(text)) {
    throw new Error("Private link or credential pattern in " + source);
  }
  return text.replace(/"(\/[^"\r\n]*)"/g, (quoted, path) =>
    routes.has(path) ? JSON.stringify(routes.get(path)) : quoted);
}

const output = resolve(destination);
for (const [source, target] of targets) {
  const input = new URL("../public/" + source, import.meta.url);
  const content = source.endsWith(".png") ? await readFile(input) : publicContent(source, await readFile(input, "utf8"));
  const file = resolve(output, target);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}
await writeFile(resolve(output, ".nojekyll"), "");
