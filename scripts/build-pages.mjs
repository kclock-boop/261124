import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [destination, basePath = "/261124/", access, extra] = process.argv.slice(2);
const editionFlag = /^--v([34])(-desktop)?$/.exec(access ?? "");
const privateSite = access === "--private-site";
const redactor = access === "--v4-desktop" && extra === "--with-redactor";
if (!destination || !/^\/(?:[\w.-]+\/)*$/.test(basePath) || (access && !privateSite && !editionFlag) || (extra && !redactor)) {
  throw new Error("Usage: node scripts/build-pages.mjs <destination> [basePath] [--private-site | --v3 | --v3-desktop | --v4 | --v4-desktop] [--with-redactor]");
}
const edition = Number(editionFlag?.[1] ?? 2);
const desktop = Boolean(editionFlag?.[2]);
const hasInventory = edition >= 3;
const participantDesk = hasInventory ? "modules/desk-participant-v3.html" : "modules/desk-participant.html";
const participantSafety = edition === 4 ? "modules/safety-participant-v4.html" : "modules/safety-participant.html";

const targets = new Map([
  ["portal.html", "index.html"],
  ["index.html", "documents.html"],
  ...[
    "portal.css", "portal.js", "desk-data.js", "desk.css", "desk.js",
    "modules/desk.html", "modules/safety.html", "modules/moyang.html",
    "modules/folder.html", "tool-v2.css", "folder.js",
    "styles.css", "app.js", "sw.js", "manifest.webmanifest", "favicon.svg",
    "icon-192.png", "icon-512.png", "harbor-intro.jpg", "harbor-loop.mp4", "taehwa-logo.png",
    "ai-training-center.png", "hrdk-logo.png"
  ].map(name => [name, name]),
  ...(privateSite ? ["modules/review.html", "review.js"] : [participantDesk, participantSafety])
    .map(name => [name, name]),
  ...(hasInventory ? ["modules/inventory.html", "inventory.css", "inventory.js", "inventory-data.js"] : [])
    .map(name => [name, name]),
  ...(edition === 4 ? [["modules/inventory-participant-v4.html", "modules/inventory-participant-v4.html"]] : []),
  ...(redactor ? [["modules/redactor-start.html", "modules/redactor-start.html"]] : [])
]);

const routes = new Map([
  ...[...targets.values()].map(name => ["/" + name, basePath + name]),
  ["/", basePath],
  ["/documents", basePath + "documents.html"]
]);

function publicContent(source, text) {
  if (source === "portal.html") {
    text = text.replace(/^[ \t]*<a class="reference"[^\r\n]*\r?\n/m, "");
    if (redactor) {
      text = text.replace("AI 경진대회 제출 자료를 확인하고 제출용 점검표를 작성합니다.", "문서 속 민감정보를 찾아 선택한 항목을 가린 사본을 만듭니다.")
        .replace("<strong>경진대회 사전검토</strong>", "<strong>자료 선택 가림 · 이 PC에서 실행</strong>");
    } else if (!privateSite) {
      text = text.replace(/^[ \t]*<a\b[^>]*\bdata-private-tool\b[^>]*>[\s\S]*?<\/a>[ \t]*(?:\r?\n|$)/gm, "");
    }
    text = hasInventory
      ? text.replaceAll("업무자동화 2차", "업무자동화 " + edition + "차").replace(" data-v3-tool hidden", "")
      : text.replace(/^[ \t]*<a\b[^>]*\bdata-v3-tool\b[^>]*>[\s\S]*?<\/a>[ \t]*(?:\r?\n|$)/gm, "");
    if (edition === 4) {
      text = text.replace("ERP와 실사 수량을 대조하고 수불 이력과 조치 내역을 확인합니다.", "발표용 원본에서 업무 흐름을 보고 CSV 재고 대조를 실습합니다.");
    }
  }
  if (!privateSite && source === "portal.js") {
    text = text.replace(/^[ \t]*review:[^\r\n]*\r?\n/m, redactor ? '  review: ["자료 선택 가림", "/modules/redactor-start.html"],\n' : "")
      .replace(/(  desk: \["업무 데스크", )"https:[^"]+"/, '$1"/' + participantDesk + '"')
      .replace(/(  safety: \["현장안전포털", )"https:[^"]+"/, '$1"/' + participantSafety + '"');
    if (hasInventory) {
      const screens = edition === 4
        ? '  inventory: ["코일·원자재 재고 대조", "/modules/inventory-participant-v4.html", "inventory-csv", "CSV 재고 대조 열기"],\n  "inventory-csv": ["CSV 재고 대조", "/modules/inventory.html"],'
        : '  inventory: ["코일·원자재 재고 대조", "/modules/inventory.html"],';
      text = text.replace("const screens = {", "const screens = {\n" + screens);
    }
  }
  if (!privateSite && source === "modules/folder.html") {
    text = text.replace(/^[ \t]*<a [^\r\n]*data-original-folder-link[^\r\n]*\r?\n/m, "");
  }
  if (source === "index.html" && !desktop) {
    text = text.replace("<body>", '<body data-pages-preview>')
      .replace('id="generate"', 'id="generate" disabled')
      .replace(/(<p class="privacy">[^\r\n]*?<span>)[^<]*/, "$1공개 화면에서는 문서를 직접 작성하고 저장할 수 있습니다. AI 초안 작성은 로컬 실행에서 사용할 수 있습니다.");
  }
  if (source === "sw.js") {
    const shell = ["/", ...[...targets.values()].filter(name => name !== "sw.js" && !name.endsWith(".mp4")).map(name => "/" + name)];
    text = text.replace("taehwa-document-workspace-", "taehwa-pages-" + basePath + "-")
      .replace(/const shell = \[[\s\S]*?\];/, "const shell = " + JSON.stringify(shell, null, 2) + ";");
  }
  if (source === "manifest.webmanifest" && hasInventory) {
    text = text.replace("업무자동화 2차", "업무자동화 " + edition + "차").replace('"태화 업무자동화"', '"태화 업무자동화 ' + edition + '차"');
  }
  const sharedLink = /chatgpt\.com\/s\//i.test(text);
  const allowSourceLink = source === "modules/review.html" && privateSite;
  if ((sharedLink && !allowSourceLink) || /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}/i.test(text)) {
    throw new Error("Private link or credential pattern in " + source);
  }
  return text.replace(/"(\/[^"\r\n]*)"/g, (quoted, path) =>
    routes.has(path) ? JSON.stringify(routes.get(path)) : quoted);
}

const output = resolve(destination);
for (const [source, target] of targets) {
  const input = new URL("../public/" + source, import.meta.url);
  const content = /\.(?:png|jpg|mp4)$/.test(source) ? await readFile(input) : publicContent(source, await readFile(input, "utf8"));
  const file = resolve(output, target);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}
await writeFile(resolve(output, ".nojekyll"), "");
