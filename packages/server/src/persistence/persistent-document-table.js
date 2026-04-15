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
// TODO(next:PERSIST01): 明确哪些状态继续留在 persistent_documents，哪些需要拆成长期专表与索引，避免 MMO 真源长期停留在通用文档表。

/** 初始化 persistent_documents 表并加数据库 advisory lock，避免并发重复建表。 */
async function ensurePersistentDocumentsTable(pool) {

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

