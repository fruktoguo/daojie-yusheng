// @ts-nocheck

/**
 * 用途：运行 server 协议审计入口。
 */

const childProcess = require("node:child_process");
const path = require("node:path");
const pg = require("pg");
const lib = require("./protocol-audit-lib.js");
const nextGmContract = require("../http/native/native-gm-contract");
const serverEntry = path.join(lib.distRoot, "main.js");

function resolveAuditGmPassword() {
  return process.env.SERVER_GM_PASSWORD || process.env.GM_PASSWORD || "admin123";
}

async function resetLocalGmPasswordRecordIfNeeded() {
  const databaseUrl = process.env.SERVER_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl.trim()) {
    return;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  try {
    await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', [
      nextGmContract.GM_AUTH_CONTRACT.passwordRecordScope,
      nextGmContract.GM_AUTH_CONTRACT.passwordRecordKey,
    ]);
  } finally {
    await pool.end().catch(() => undefined);
  }
}
/**
 * 启动审计服务端。
 */
function startAuditServer(requestedPort, gmPassword) {
  return new Promise((resolve, reject) => {
/**
 * 记录子进程。
 */
    const child = childProcess.spawn("node", [serverEntry], {
      cwd: lib.repoRoot,
      env: {
        ...process.env,
        SERVER_PORT: String(requestedPort),
        SERVER_RUNTIME_HTTP: "1",
        SERVER_ALLOW_UNREADY_TRAFFIC: "1",
        SERVER_SMOKE_ALLOW_UNREADY: "1",
        SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD: process.env.SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD || "1",
        SERVER_GM_PASSWORD: gmPassword,
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
        reject(new Error("server audit runner startup timeout"));
      }
    }, 20000);
/**
 * 刷新flush。
 */
    function flush(stream, chunk) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      reject(new Error("server audit runner exited before ready: code=" + code + " signal=" + (signal || "none")));
    });
  });
}
/**
 * 运行审计。
 */
async function runAudit(baseUrl, gmPassword) {
/**
 * 记录子进程。
 */
  const auditScript = path.join(lib.distRoot, "tools", "protocol-audit.js");
  const child = childProcess.spawn("node", [auditScript], {
    cwd: lib.repoRoot,
    env: {
      ...process.env,
      SERVER_URL: baseUrl,
      SERVER_SHADOW_URL: baseUrl,
      SERVER_GM_PASSWORD: gmPassword,
      GM_PASSWORD: gmPassword,
      SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD: process.env.SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD || "1",
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录requested端口。
 */
  const requestedPort = process.env.SERVER_AUDIT_PORT ? Number(process.env.SERVER_AUDIT_PORT) : null;
/**
 * 记录desired端口。
 */
  const desiredPort = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : await lib.allocateFreePort();
  const gmPassword = resolveAuditGmPassword();
/**
 * 记录服务端。
 */
  let server = null;
  try {
    await resetLocalGmPasswordRecordIfNeeded();
    server = await startAuditServer(desiredPort, gmPassword);
/**
 * 记录base地址。
 */
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await lib.waitForHealth(baseUrl, 20000);
    process.exitCode = await runAudit(baseUrl, gmPassword);
  } finally {
    await lib.stopServer(server && server.child ? server.child : null);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
