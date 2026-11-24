import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { defaultUrl, serviceName, startServer } from "../server/index.mjs";

async function running() {
  try {
    const response = await fetch(defaultUrl + "/api/health", { signal: AbortSignal.timeout(750) });
    return response.ok && (await response.json()).service === serviceName;
  } catch {
    return false;
  }
}

async function launch() {
  const appWindow = process.argv[2] === "app";
  const edge = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA]
    .filter(Boolean)
    .map(base => join(base, "Microsoft", "Edge", "Application", "msedge.exe"))
    .find(existsSync);
  if (!edge) throw new Error("Microsoft Edge was not found. Run npm start and open " + defaultUrl + " in a browser.");

  let server;
  if (!await running()) {
    try {
      server = await startServer();
    } catch (error) {
      if (error.code !== "EADDRINUSE" || !await running()) throw error;
    }
  }
  try {
    const browser = spawn(edge, [appWindow ? "--app=" + defaultUrl : defaultUrl], {
      detached: true,
      stdio: "ignore"
    });
    await once(browser, "spawn");
    browser.unref();
    if (server) {
      console.log("Taehwa Document Workspace");
      console.log("Local: " + defaultUrl);
      console.log("Keep this window open while using AI. Close it or press Ctrl+C to stop the local server.");
    }
  } catch (error) {
    server?.close();
    throw error;
  }
}

try {
  await launch();
} catch (error) {
  const explanation = error.code === "EADDRINUSE"
    ? "Port 8888 is in use by another program. Close that program, then try again."
    : error.message;
  console.error(explanation);
  process.exitCode = 1;
}
