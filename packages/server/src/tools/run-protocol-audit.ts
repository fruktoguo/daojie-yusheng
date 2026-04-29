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
const GM_AUTH_TABLE = "server_gm_auth";

function resolveAuditGmPassword() {
  return process.env.SERVER_GM_PASSWORD || process.env.GM_PASSWORD || "admin123";
}

async function snapshotLocalGmPasswordRecordIfNeeded() {
  const databaseUrl = process.env.SERVER_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl.trim()) {
    return null;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });

  try {
    const result = await pool.query(`SELECT raw_payload, updated_at FROM ${GM_AUTH_TABLE} WHERE record_key = $1`, [
      nextGmContract.GM_AUTH_CONTRACT.passwordRecordKey,
    ]).catch((error) => {
      if (error && typeof error === "object" && error.code === "42P01") {
        return { rows: [] };
      }
      throw error;
    });
    const row = result.rows[0] ?? null;
    return {
      databaseUrl,
      existed: Boolean(row),
      payload: row?.raw_payload ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
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
    await pool.query(`DELETE FROM ${GM_AUTH_TABLE} WHERE record_key = $1`, [
      nextGmContract.GM_AUTH_CONTRACT.passwordRecordKey,
    ]).catch((error) => {
      if (!error || typeof error !== "object" || error.code !== "42P01") {
        throw error;
      }
    });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function restoreLocalGmPasswordRecordIfNeeded(snapshot) {
  if (!snapshot?.databaseUrl) {
    return;
  }

  const pool = new pg.Pool({
    connectionString: snapshot.databaseUrl,
  });

  try {
    if (!snapshot.existed) {
      await pool.query(`DELETE FROM ${GM_AUTH_TABLE} WHERE record_key = $1`, [
        nextGmContract.GM_AUTH_CONTRACT.passwordRecordKey,
      ]).catch((error) => {
        if (!error || typeof error !== "object" || error.code !== "42P01") {
          throw error;
        }
      });
      return;
    }

    await ensureGmAuthTable(pool);
    await pool.query(`
      INSERT INTO ${GM_AUTH_TABLE}(record_key, salt, password_hash, updated_at_text, raw_payload, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (record_key)
      DO UPDATE SET
        salt = EXCLUDED.salt,
        password_hash = EXCLUDED.password_hash,
        updated_at_text = EXCLUDED.updated_at_text,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = EXCLUDED.updated_at
    `, [
      nextGmContract.GM_AUTH_CONTRACT.passwordRecordKey,
      snapshot.payload?.salt ?? "__missing__",
      snapshot.payload?.hash ?? snapshot.payload?.passwordHash ?? "__missing__",
      snapshot.payload?.updatedAt ?? new Date().toISOString(),
      JSON.stringify(snapshot.payload),
      snapshot.updatedAt,
    ]);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function ensureGmAuthTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${GM_AUTH_TABLE} (
      record_key varchar(80) PRIMARY KEY,
      salt varchar(160) NOT NULL,
      password_hash varchar(256) NOT NULL,
      updated_at_text varchar(80) NOT NULL,
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
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
  const gmPasswordRecordSnapshot = await snapshotLocalGmPasswordRecordIfNeeded();
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
    await restoreLocalGmPasswordRecordIfNeeded(gmPasswordRecordSnapshot);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
