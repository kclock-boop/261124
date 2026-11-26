import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { once } from "node:events";
import { Readable } from "node:stream";
import generate from "./generate.mjs";

const assets = new Map([
  ["/", ["portal.html", "text/html; charset=utf-8"]],
  ["/index.html", ["portal.html", "text/html; charset=utf-8"]],
  ["/portal.css", ["portal.css", "text/css; charset=utf-8"]],
  ["/portal.js", ["portal.js", "text/javascript; charset=utf-8"]],
  ["/desk-data.js", ["desk-data.js", "text/javascript; charset=utf-8"]],
  ["/desk.js", ["desk.js", "text/javascript; charset=utf-8"]],
  ["/desk.css", ["desk.css", "text/css; charset=utf-8"]],
  ["/tool-v2.css", ["tool-v2.css", "text/css; charset=utf-8"]],
  ["/review.js", ["review.js", "text/javascript; charset=utf-8"]],
  ["/folder.js", ["folder.js", "text/javascript; charset=utf-8"]],
  ["/modules/review.html", ["modules/review.html", "text/html; charset=utf-8"]],
  ["/modules/folder.html", ["modules/folder.html", "text/html; charset=utf-8"]],
  ["/modules/desk.html", ["modules/desk.html", "text/html; charset=utf-8"]],
  ["/modules/safety.html", ["modules/safety.html", "text/html; charset=utf-8", true]],
  ["/modules/moyang.html", ["modules/moyang.html", "text/html; charset=utf-8", true]],
  ["/documents", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
  ["/harbor-intro.jpg", ["harbor-intro.jpg", "image/jpeg"]],
  ["/harbor-loop.mp4", ["harbor-loop.mp4", "video/mp4"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json; charset=utf-8"]],
  ["/sw.js", ["sw.js", "text/javascript; charset=utf-8"]],
  ["/icon-192.png", ["icon-192.png", "image/png"]],
  ["/icon-512.png", ["icon-512.png", "image/png"]]
]);
const localHost = "127.0.0.1";
export const defaultUrl = "http://" + localHost + ":8888";
export const serviceName = "taehwa-document-workspace";

const headers = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "content-security-policy": "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'"
};
const modulePolicy = headers["content-security-policy"] +
  "; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:";
const portalPolicy = headers["content-security-policy"] +
  "; frame-src 'self' https://workdesk-report-demo.grandswan2048.chatgpt.site https://htmlpreview.github.io";

function sendJson(response, status, data) {
  response.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function serveVideo(req, res, file, contentType) {
  const { size } = await stat(file);
  const videoHeaders = { ...headers, "Content-Type": contentType, "Accept-Ranges": "bytes" };
  const range = req.method === "GET" && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  const partial = Boolean(range && (range[1] || range[2]));
  let start = 0;
  let end = size - 1;
  if (partial && range[1]) {
    start = Number(range[1]);
    if (range[2]) end = Math.min(end, Number(range[2]));
  } else if (partial) {
    start = Math.max(0, size - Number(range[2]));
  }
  if (start > end) {
    res.writeHead(416, { ...videoHeaders, "Content-Range": "bytes */" + size }).end();
    return;
  }
  if (partial) videoHeaders["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
  videoHeaders["Content-Length"] = end - start + 1;
  res.writeHead(partial ? 206 : 200, videoHeaders);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  stream.on("error", error => res.destroy(error));
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

export async function startServer(port = Number(new URL(defaultUrl).port)) {
  const server = createServer(async (req, res) => {
    try {
      const activePort = server.address().port;
      const allowedHosts = [localHost + ":" + activePort, "localhost:" + activePort];
      if (!allowedHosts.includes(req.headers.host) || !req.url?.startsWith("/") || req.url.startsWith("//")) {
        res.writeHead(403, headers).end();
        return;
      }

      const origin = "http://" + req.headers.host;
      const url = new URL(req.url, origin);
      if (url.origin !== origin) {
        res.writeHead(403, headers).end();
        return;
      }
      if (url.pathname === "/api/health" && req.method === "GET") {
        sendJson(res, 200, { service: serviceName, edition: 2 });
        return;
      }
      if (url.pathname === "/api/generate") {
        if (req.headers.origin && req.headers.origin !== origin) {
          sendJson(res, 403, { error: "현재 열린 문서작업실 화면에서 요청해 주세요." });
          return;
        }
        const hasBody = req.method !== "GET" && req.method !== "HEAD";
        if (req.method === "POST" && req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
          sendJson(res, 415, { error: "JSON 형식으로 요청해 주세요." });
          return;
        }
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          body: hasBody ? Readable.toWeb(req) : undefined,
          duplex: hasBody ? "half" : undefined
        });
        const response = await generate(request);
        res.writeHead(response.status, { ...headers, ...Object.fromEntries(response.headers) });
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const asset = assets.get(url.pathname);
      if (!asset || !["GET", "HEAD"].includes(req.method)) {
        res.writeHead(404, headers).end("Not found");
        return;
      }
      const [filename, contentType, originalModule] = asset;
      const file = new URL("../public/" + filename, import.meta.url);
      if (contentType === "video/mp4") {
        await serveVideo(req, res, file, contentType);
        return;
      }
      const content = await readFile(file);
      res.writeHead(200, {
        ...headers, "Content-Type": contentType,
        "content-security-policy": filename === "portal.html"
          ? portalPolicy : originalModule ? modulePolicy : headers["content-security-policy"]
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch {
      if (res.headersSent) res.destroy();
      else sendJson(res, 500, { error: "로컬 서버 오류가 발생했습니다." });
    }
  });

  server.listen(port, localHost);
  await once(server, "listening");
  return server;
}
