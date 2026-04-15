"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePersistentDocumentsTable = ensurePersistentDocumentsTable;
/** LOCK_NAMESPACE：定义该变量以承载业务值。 */
const LOCK_NAMESPACE = 42871;
/** LOCK_KEY：定义该变量以承载业务值。 */
const LOCK_KEY = 1001;
/** CREATE_PERSISTENT_DOCUMENTS_SQL：定义该变量以承载业务值。 */
const CREATE_PERSISTENT_DOCUMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS persistent_documents (
    scope varchar(64) NOT NULL,
    key varchar(100) NOT NULL,
    payload jsonb NOT NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, key)
  )
`;
/** ensurePersistentDocumentsTable：执行对应的业务逻辑。 */
async function ensurePersistentDocumentsTable(pool) {
/** client：定义该变量以承载业务值。 */
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
