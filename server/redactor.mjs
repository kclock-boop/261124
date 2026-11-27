import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function createRedactor() {
  const root = fileURLToPath(new URL("../private-redactor/", import.meta.url));
  let processRef;
  let startup;

  function open() {
    if (startup) return startup;
    const data = process.env.TAEHWA_REDACTOR_DATA_DIR ??
      join(process.env.LOCALAPPDATA ?? root, "TaehwaDocumentWorkspaceV4", "redactor-settings");
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.REDACTOR_DEBUG;
    delete env.REDACTOR_DEV_DIR;
    const child = spawn(join(root, "python", "python.exe"),
      ["-B", join(root, "run.py"), data], {
        cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env
      });
    processRef = child;
    child.stdin.on("error", () => {});
    startup = new Promise((resolve, reject) => {
      const failure = new Error("로컬 자료 가림을 시작하지 못했습니다.");
      const timeout = setTimeout(() => {
        child.kill();
        reject(failure);
      }, 14000);
      let line = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        if (line.includes("\n")) return;
        line += chunk;
        if (!line.includes("\n")) return;
        const port = Number(line.split("\n", 1)[0]);
        if (Number.isInteger(port) && port > 1023 && port <= 65535) {
          clearTimeout(timeout);
          resolve("http://127.0.0.1:" + port + "/");
        } else {
          child.kill();
          clearTimeout(timeout);
          reject(failure);
        }
      });
      const stopped = () => {
        clearTimeout(timeout);
        if (processRef === child) {
          startup = undefined;
          processRef = undefined;
        }
        reject(failure);
      };
      child.once("error", stopped);
      child.once("exit", stopped);
    });
    return startup;
  }

  function close() {
    processRef?.stdin.end();
  }
  return { open, close };
}
