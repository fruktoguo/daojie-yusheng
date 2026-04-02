"use strict";
const childProcess = require("node:child_process");
const path = require("node:path");
const lib = require("./next-protocol-audit-lib");
const serverEntry = path.join(lib.distRoot, "main.js");
function startAuditServer(requestedPort) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn("node", [serverEntry], {
      cwd: lib.packageRoot,
      env: {
        ...process.env,
        SERVER_NEXT_PORT: String(requestedPort),
        SERVER_NEXT_RUNTIME_HTTP: "1",
        SERVER_NEXT_ALLOW_UNREADY_TRAFFIC: "1",
        SERVER_NEXT_SMOKE_ALLOW_UNREADY: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("server-next audit runner startup timeout"));
      }
    }, 20000);
    function flush(stream, chunk) {
      const text = chunk.toString();
      buffer += text;
      process[stream].write(text);
      const match = buffer.match(/Server Next running on http:\/\/[^:]+:(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ child, port: Number(match[1]) });
      }
    }
    child.stdout.on("data", (chunk) => flush("stdout", chunk));
    child.stderr.on("data", (chunk) => flush("stderr", chunk));
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error("server-next audit runner exited before ready: code=" + code + " signal=" + (signal || "none")));
    });
  });
}
async function runAudit(baseUrl) {
  const child = childProcess.spawn("node", ["dist/tools/next-protocol-audit.js"], {
    cwd: lib.packageRoot,
    env: {
      ...process.env,
      SERVER_NEXT_URL: baseUrl,
    },
    stdio: "inherit",
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}
async function main() {
  const requestedPort = process.env.SERVER_NEXT_AUDIT_PORT ? Number(process.env.SERVER_NEXT_AUDIT_PORT) : null;
  const desiredPort = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : await lib.allocateFreePort();
  let server = null;
  try {
    server = await startAuditServer(desiredPort);
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await lib.waitForHealth(baseUrl, 20000);
    process.exitCode = await runAudit(baseUrl);
  } finally {
    await lib.stopServer(server && server.child ? server.child : null);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
