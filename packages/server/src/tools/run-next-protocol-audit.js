"use strict";
/**
 * 用途：运行 server-next 协议审计入口。
 */

const childProcess = require("node:child_process");
const path = require("node:path");
const lib = require("./next-protocol-audit-lib");
const serverEntry = path.join(lib.distRoot, "main.js");
/**
 * 启动审计服务端。
 */
function startAuditServer(requestedPort) {
  return new Promise((resolve, reject) => {
/**
 * 记录子进程。
 */
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
/**
 * 记录缓冲区。
 */
    let buffer = "";
/**
 * 记录settled。
 */
    let settled = false;
/**
 * 记录超时时间。
 */
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("server-next audit runner startup timeout"));
      }
    }, 20000);
/**
 * 刷新flush。
 */
    function flush(stream, chunk) {
/**
 * 记录text。
 */
      const text = chunk.toString();
      buffer += text;
      process[stream].write(text);
/**
 * 记录match。
 */
      const match = buffer.match(/(?:Server Next running on|服务端已运行于)\s+http:\/\/[^:]+:(\d+)/);
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
/**
 * 运行审计。
 */
async function runAudit(baseUrl) {
/**
 * 记录子进程。
 */
  const child = childProcess.spawn("node", ["dist/tools/next-protocol-audit.js"], {
    cwd: lib.packageRoot,
    env: {
      ...process.env,
      SERVER_NEXT_URL: baseUrl,
      SERVER_NEXT_SHADOW_URL: baseUrl,
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
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录requested端口。
 */
  const requestedPort = process.env.SERVER_NEXT_AUDIT_PORT ? Number(process.env.SERVER_NEXT_AUDIT_PORT) : null;
/**
 * 记录desired端口。
 */
  const desiredPort = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : await lib.allocateFreePort();
/**
 * 记录服务端。
 */
  let server = null;
  try {
    server = await startAuditServer(desiredPort);
/**
 * 记录base地址。
 */
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
