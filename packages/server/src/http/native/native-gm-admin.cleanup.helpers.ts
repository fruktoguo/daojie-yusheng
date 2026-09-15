/**
 * GM 管理服务 — 表清理/列分析辅助函数。
 *
 * 从 native-gm-admin.service.ts 拆分而来，负责数据库表清理、列分析、
 * 时间列解析、恢复确认校验等运维辅助逻辑。
 * 维护时要保持清理规则与持久化真源边界一致。
 */
import { BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import type { GmHighRiskConfirmationBody } from './native-gm-high-risk';
import type { GmActorContext } from './native-gm-actor-context';
import {
    DATABASE_CLEANUP_OPERATIONAL_TABLES,
    DATABASE_CLEANUP_SPECIALIZED_TABLES,
    DATABASE_CLEANUP_PROTECTED_EXACT_TABLES,
    DATABASE_CLEANUP_PROTECTED_PREFIXES,
    DATABASE_CLEANUP_TIME_COLUMN_CANDIDATES,
    type DatabaseTableColumnInfo,
    type DatabaseCleanupTimeColumn,
} from './native-gm-admin.service';
export async function cleanupSpecializedFlushLedgerTable(pool: Pool, tableName: string, mode: 'older_than' | 'all') {
    if (mode !== 'all') {
        throw new BadRequestException('刷盘账本只支持“直接清空”：实际只删除 latest_version <= flushed_version 且无有效 claim 的已完成账本');
    }
    const quotedTableName = quoteIdentifier(tableName);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`LOCK TABLE ${quotedTableName} IN ACCESS EXCLUSIVE MODE`);
        const countResult = await client.query(
            `
            SELECT
                COUNT(*)::bigint AS total_rows,
                COUNT(*) FILTER (WHERE latest_version > flushed_version)::bigint AS dirty_rows,
                COUNT(*) FILTER (WHERE claim_until IS NOT NULL AND claim_until >= now())::bigint AS active_claim_rows
            FROM ${quotedTableName}
            `,
        );
        const totalRows = Math.max(0, Math.trunc(Number(countResult.rows[0]?.total_rows ?? 0)));
        const dirtyRows = Math.max(0, Math.trunc(Number(countResult.rows[0]?.dirty_rows ?? 0)));
        const activeClaimRows = Math.max(0, Math.trunc(Number(countResult.rows[0]?.active_claim_rows ?? 0)));
        if (activeClaimRows > 0) {
            throw new BadRequestException(`刷盘账本仍有 ${activeClaimRows} 条有效 claim，拒绝清理: ${tableName}`);
        }
        let deletedRows = 0;
        let compacted = false;
        if (dirtyRows === 0) {
            await client.query(`TRUNCATE TABLE ${quotedTableName}`);
            deletedRows = totalRows;
            compacted = true;
        } else {
            const deleteResult = await client.query(
                `
                DELETE FROM ${quotedTableName}
                WHERE latest_version <= flushed_version
                  AND (claimed_by IS NULL OR claim_until < now())
                `,
            );
            deletedRows = deleteResult.rowCount ?? 0;
        }
        await client.query('COMMIT');
        await pool.query(`ANALYZE ${quotedTableName}`);
        return {
            target: tableName,
            mode,
            deletedRows,
            message: compacted
                ? `已清空 ${tableName} 的 ${deletedRows} 条已完成刷盘账本，并通过 TRUNCATE 释放物理空间`
                : `已删除 ${tableName} 的 ${deletedRows} 条已完成刷盘账本；仍有 ${dirtyRows} 条未完成任务，物理空间会由 PostgreSQL 后续复用`,
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

export function assertRestoreConfirmationMatchesBackup(
    backupId: string,
    confirmation: GmHighRiskConfirmationBody | undefined,
    recordedChecksum: string,
): void {
    // 密码登录的 GM 即可发起恢复；不再要求客户端重复提交 backupId/checksum 二次确认。
    // 仍强制有 backupId，并保留 recordedChecksum 供后续服务端文件完整性校验使用。
    if (!backupId) {
        throw new BadRequestException('数据库恢复请求体缺少 backupId');
    }
    if (!recordedChecksum) {
        throw new BadRequestException('目标备份缺少 checksumSha256，无法校验 PostgreSQL 数据库归档完整性');
    }
    void confirmation;
}

export function buildSystemGmActor(): GmActorContext {
    return { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now(), scopes: [] };
}

export function formatPgBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function buildTableColumnsMap(rows: Array<Record<string, unknown>>): Map<string, DatabaseTableColumnInfo[]> {
    const map = new Map<string, DatabaseTableColumnInfo[]>();
    for (const row of rows) {
        const tableName = String(row.table_name ?? '');
        const columnName = String(row.column_name ?? '');
        const dataType = String(row.data_type ?? '');
        if (!tableName || !columnName) continue;
        const columns = map.get(tableName) ?? [];
        columns.push({ columnName, dataType });
        map.set(tableName, columns);
    }
    return map;
}

export function normalizeDatabaseCleanupTableName(target: string): string {
    const tableName = String(target ?? '').trim();
    if (!/^[a-z_][a-z0-9_]*$/iu.test(tableName)) {
        throw new BadRequestException('清理目标表名非法');
    }
    return tableName;
}

export function getDatabaseCleanupBlockedReason(tableName: string, columns: DatabaseTableColumnInfo[]): string | null {
    if (!columns.length) {
        return '表不存在或不是 public 普通表';
    }
    if (DATABASE_CLEANUP_SPECIALIZED_TABLES.has(tableName)) {
        return '刷盘账本必须通过 flush-ledger-retention 调度器任务按 version/claim/retry 语义清理';
    }
    if (DATABASE_CLEANUP_OPERATIONAL_TABLES.has(tableName)) {
        return null;
    }
    if (DATABASE_CLEANUP_PROTECTED_EXACT_TABLES.has(tableName)) {
        return '真实落盘数据表不允许清理';
    }
    if (DATABASE_CLEANUP_PROTECTED_PREFIXES.some((prefix) => tableName.startsWith(prefix))) {
        return '真实落盘数据表不允许清理';
    }
    return null;
}

export async function loadPublicRegularTableColumns(pool: Pool, tableName: string): Promise<DatabaseTableColumnInfo[]> {
    const result = await pool.query(
        `
        SELECT c.column_name, c.data_type
        FROM information_schema.columns c
        JOIN pg_class pc ON pc.relname = c.table_name
        JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
        WHERE c.table_schema = 'public'
          AND c.table_name = $1
          AND pc.relkind = 'r'
        ORDER BY c.ordinal_position ASC
        `,
        [tableName],
    );
    return result.rows.map((row) => ({
        columnName: String(row.column_name ?? ''),
        dataType: String(row.data_type ?? ''),
    })).filter((column) => column.columnName);
}

export function resolveDatabaseCleanupTimeColumn(columns: DatabaseTableColumnInfo[]): DatabaseCleanupTimeColumn | null {
    const columnsByName = new Map(columns.map((column) => [column.columnName, column]));
    for (const candidate of DATABASE_CLEANUP_TIME_COLUMN_CANDIDATES) {
        const column = columnsByName.get(candidate);
        if (!column) continue;
        const kind = resolveDatabaseCleanupTimeColumnKind(column);
        if (kind) {
            return { columnName: column.columnName, kind };
        }
    }
    for (const column of columns) {
        const kind = resolveDatabaseCleanupTimeColumnKind(column);
        if (kind && /(?:^|_)(?:created|updated|failed|delivered|archived|heartbeat|started|dirty_since)(?:_|$)/iu.test(column.columnName)) {
            return { columnName: column.columnName, kind };
        }
    }
    return null;
}

export function resolveDatabaseCleanupTimeColumnKind(column: DatabaseTableColumnInfo): DatabaseCleanupTimeColumn['kind'] | null {
    const dataType = column.dataType.toLowerCase();
    if (dataType === 'timestamp with time zone' || dataType === 'timestamp without time zone' || dataType === 'date') {
        return 'timestamp';
    }
    if ((dataType === 'bigint' || dataType === 'integer' || dataType === 'numeric') && /(?:_at_ms|_ms)$/iu.test(column.columnName)) {
        return 'epoch_ms';
    }
    if ((dataType === 'character varying' || dataType === 'text' || dataType === 'character') && /_at_text$/iu.test(column.columnName)) {
        return 'iso_text';
    }
    return null;
}

export function buildDatabaseCleanupTimePredicate(column: DatabaseCleanupTimeColumn): string {
    const quotedColumn = quoteIdentifier(column.columnName);
    if (column.kind === 'epoch_ms') {
        return `${quotedColumn} < (EXTRACT(EPOCH FROM (now() - $1::interval)) * 1000)::bigint`;
    }
    if (column.kind === 'iso_text') {
        return `${quotedColumn} < to_char((now() AT TIME ZONE 'UTC') - $1::interval, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    }
    return `${quotedColumn} < now() - $1::interval`;
}

export function quoteIdentifier(identifier) {
    return `"${String(identifier ?? '').replace(/"/gu, '""')}"`;
}
