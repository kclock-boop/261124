import { startServer } from "../server/index.mjs";

const desktop = process.argv.includes("--desktop");
const edition = process.argv.includes("--v4") ? 4 : process.argv.includes("--v3") ? 3 : 2;
const configuredPort = desktop ? undefined : process.env.DOCUMENT_WORKSPACE_PORT;
const port = configuredPort ? Number(configuredPort) : edition >= 3 ? 8890 + edition : undefined;
const server = await startServer(port, edition);
console.log("Local: http://127.0.0.1:" + server.address().port);

if (desktop) {
  process.stdin.resume();
  process.stdin.on("end", () => {
    server.close();
    // An in-flight AI request may still be waiting for OpenAI.
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
