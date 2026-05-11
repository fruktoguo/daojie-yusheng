/**
 * 通用持久化文档表工具。
 * 提供 persistent_documents 表的建表保证，使用 advisory lock 防止并发 DDL 冲突。
 */
const LOCK_NAMESPACE = 42871;
const LOCK_KEY = 1001;

/** 建表 SQL：scope + key 复合主键的 JSONB 文档存储 */
const CREATE_PERSISTENT_DOCUMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS persistent_documents (
    scope varchar(64) NOT NULL,
    key varchar(100) NOT NULL,
    payload jsonb NOT NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, key)
  )
`;

/** 持久化文档客户端接口 */
interface PersistentDocumentClient {
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
  release(): void;
}

/** 持久化文档连接池接口 */
interface PersistentDocumentPool {
  connect(): Promise<PersistentDocumentClient>;
}

/** 确保 persistent_documents 表存在，使用 advisory lock 保证并发安全 */
export async function ensurePersistentDocumentsTable(pool: PersistentDocumentPool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [LOCK_NAMESPACE, LOCK_KEY]);
    await client.query(CREATE_PERSISTENT_DOCUMENTS_SQL);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
