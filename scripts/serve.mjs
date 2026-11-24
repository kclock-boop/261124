import { startServer } from "../server/index.mjs";

const desktop = process.argv.includes("--desktop");
const configuredPort = desktop ? undefined : process.env.DOCUMENT_WORKSPACE_PORT;
const server = await startServer(configuredPort ? Number(configuredPort) : undefined);
console.log("Local: http://127.0.0.1:" + server.address().port);

if (desktop) {
  process.stdin.resume();
  process.stdin.on("end", () => {
    server.close();
    // An in-flight AI request may still be waiting for OpenAI.
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
