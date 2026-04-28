// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePersistentDocumentsTable = ensurePersistentDocumentsTable;

const LOCK_NAMESPACE = 42871;

const LOCK_KEY = 1001;

const CREATE_PERSISTENT_DOCUMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS persistent_documents (
    scope varchar(64) NOT NULL,
    key varchar(100) NOT NULL,
    payload jsonb NOT NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, key)
  )
`;

// persistent_documents 只保留给历史 JSON 备份导入、离线迁移和审计工具。
// packages/* 运行时真源不得再新增 scope，也不得把它作为“下次还在”的正式落点。

/** 初始化 persistent_documents 表并加数据库 advisory lock，避免并发重复建表。 */
async function ensurePersistentDocumentsTable(pool) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const client = await pool.connect();
    try {
        await client.query('SELECT pg_advisory_lock($1, $2)', [LOCK_NAMESPACE, LOCK_KEY]);
        await client.query(CREATE_PERSISTENT_DOCUMENTS_SQL);
    }
    finally {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, LOCK_KEY]).catch(() => undefined);
        client.release();
    }
}
export { ensurePersistentDocumentsTable };
