/**
 * GM 数据库备份与恢复领域契约。
 *
 * 包含备份来源类型、作业类型/状态/格式/范围/恢复模式/日志级别、
 * 备份记录、作业日志、作业快照、数据库状态响应、触发备份/上传备份响应、
 * 表统计、清理请求/响应以及恢复请求。
 */
/** 数据库备份的来源类型。 */
export type GmDatabaseBackupKind = 'hourly' | 'daily' | 'manual' | 'pre_import' | 'uploaded';

/** 数据库作业类型。 */
export type GmDatabaseJobType = 'backup' | 'restore';

/** 数据库作业状态。 */
export type GmDatabaseJobStatus = 'running' | 'completed' | 'failed';

/** 数据库备份文件格式。 */
export type GmDatabaseBackupFormat = 'postgres_custom_dump' | 'legacy_json_snapshot';

/** 数据库备份作用域。 */
export type GmDatabaseBackupScope = 'server_persistence' | 'legacy_persistent_documents';

/** 数据库恢复模式。 */
export type GmDatabaseRestoreMode = 'replace_server_persistence';

/** 数据库备份/恢复作业日志级别。 */
export type GmDatabaseJobLogLevel = 'info' | 'error';

/** 单个数据库备份记录。 */
export interface GmDatabaseBackupRecord {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * kind：kind相关字段。
 */

  kind: GmDatabaseBackupKind;
  /**
 * fileName：file名称名称或显示文本。
 */

  fileName: string;
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;
  /**
 * sizeBytes：规模Byte相关字段。
 */

  sizeBytes: number;
  /**
 * format：备份文件格式。
 */

  format?: GmDatabaseBackupFormat;
  /**
 * documentsCount：数量或计量字段。
 */

  documentsCount?: number;
  /**
 * checksumSha256：校验摘要相关字段。
 */

  checksumSha256?: string;
  /**
 * tablesCount：结构化表快照数量。
 */

  tablesCount?: number;
  /**
 * tablesChecksumSha256：结构化表校验摘要。
 */

  tablesChecksumSha256?: string;
}

/** 数据库备份/恢复作业日志。 */
export interface GmDatabaseJobLogEntry {
/**
 * at：日志时间。
 */

  at: string;
  /**
 * level：日志级别。
 */

  level: GmDatabaseJobLogLevel;
  /**
 * message：日志内容。
 */

  message: string;
  /**
 * phase：作业阶段。
 */

  phase?: string;
}

/** 数据库备份/恢复作业快照。 */
export interface GmDatabaseJobSnapshot {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * type：type相关字段。
 */

  type: GmDatabaseJobType;
  /**
 * status：statu状态或数据块。
 */

  status: GmDatabaseJobStatus;
  /**
 * startedAt：startedAt相关字段。
 */

  startedAt: string;
  /**
 * finishedAt：finishedAt相关字段。
 */

  finishedAt?: string;
  /**
 * kind：kind相关字段。
 */

  kind?: GmDatabaseBackupKind;
  /**
 * backupId：backupID标识。
 */

  backupId?: string;
  /**
 * sourceBackupId：来源BackupID标识。
 */

  sourceBackupId?: string;
  /**
 * error：error相关字段。
 */

  error?: string;
  /**
 * phase：当前或结束阶段。
 */

  phase?: string;
  /**
 * checkpointBackupId：导入前检查点备份 ID。
 */

  checkpointBackupId?: string;
  /**
 * appliedAt：恢复实际写入完成时间。
 */

  appliedAt?: string;
  /**
 * logs：最近作业日志。
 */

  logs?: GmDatabaseJobLogEntry[];
}

/** 数据库管理状态响应。 */
export interface GmDatabaseStateRes {
/**
 * backups：backup相关字段。
 */

  backups: GmDatabaseBackupRecord[];
  /**
 * runningJob：runningJob相关字段。
 */

  runningJob?: GmDatabaseJobSnapshot;
  /**
 * lastJob：lastJob相关字段。
 */

  lastJob?: GmDatabaseJobSnapshot;
  /**
 * recentJobLogs：最近数据库任务日志。
 */

  recentJobLogs?: GmDatabaseJobLogEntry[];
  /**
 * persistenceEnabled：启用开关或状态标识。
 */

  persistenceEnabled?: boolean;
  /**
 * scope：scope相关字段。
 */

  scope?: GmDatabaseBackupScope;
  /**
 * restoreMode：restoreMode相关字段。
 */

  restoreMode?: GmDatabaseRestoreMode;
  /**
 * note：note相关字段。
 */

  note?: string;
  /**
 * automation：automation相关字段。
 */

  automation?: {
  /**
 * retentionEnforced：retentionEnforced相关字段。
 */

    retentionEnforced: boolean;
    /**
 * schedulesActive：schedule激活状态相关字段。
 */

    schedulesActive: boolean;
    /**
 * restoreRequiresMaintenance：restoreRequireMaintenance相关字段。
 */

    restoreRequiresMaintenance: boolean;
    /**
 * preImportBackupEnabled：启用开关或状态标识。
 */

    preImportBackupEnabled: boolean;
  };
  /**
 * retention：retention相关字段。
 */

  retention: {
  /**
 * hourly：hourly相关字段。
 */

    hourly: number;
    /**
 * daily：daily相关字段。
 */

    daily: number;
  };
  /**
 * schedules：schedule相关字段。
 */

  schedules: {
  /**
 * hourly：hourly相关字段。
 */

    hourly: string;
    /**
 * daily：daily相关字段。
 */

    daily: string;
  };
}

/** 触发数据库备份后的响应。 */
export interface GmTriggerDatabaseBackupRes {
/**
 * job：job相关字段。
 */

  job: GmDatabaseJobSnapshot;
  /**
 * scope：scope相关字段。
 */

  scope?: GmDatabaseBackupScope;
  /**
 * documentsCount：数量或计量字段。
 */

  documentsCount?: number;
}

/** 上传数据库备份后的响应。 */
export interface GmUploadDatabaseBackupRes {
/**
 * backup：已登记的备份记录。
 */

  backup: GmDatabaseBackupRecord;
  /**
 * scope：scope相关字段。
 */

  scope?: GmDatabaseBackupScope;
}

/** 数据库单表占用统计。 */
export interface GmDatabaseTableStat {
  tableName: string;
  rowEstimate: number;
  totalBytes: number;
  totalSize: string;
  tableBytes: number;
  tableSize: string;
  indexBytes: number;
  indexSize: string;
  toastBytes: number;
  toastSize: string;
  cleanupAllowed?: boolean;
  cleanupOlderThanAllowed?: boolean;
  cleanupTimeColumn?: string | null;
  cleanupBlockedReason?: string | null;
}

/** 数据库表占用统计响应。 */
export interface GmDatabaseTableStatsRes {
  tables: GmDatabaseTableStat[];
  totalBytes: number;
  totalSize: string;
  fetchedAt: string;
}

/** 数据库表清理请求。 */
export interface GmDatabaseCleanupReq {
  target: string;
  mode?: 'older_than' | 'all';
  olderThanDays?: number;
  /** 高危确认短语，须为 CLEAN DATABASE TABLE。 */
  confirmationPhrase?: string;
  confirmPhrase?: string;
}

/** 数据库表清理响应。 */
export interface GmDatabaseCleanupRes {
  target: string;
  mode: 'older_than' | 'all';
  deletedRows: number;
  message: string;
}

/** 触发数据库恢复的请求。 */
export interface GmRestoreDatabaseReq {
/**
 * backupId：backupID标识。
 */

  backupId: string;
  /** 高危确认短语，须为 RESTORE SERVER PERSISTENCE。 */
  confirmationPhrase?: string;
  confirmPhrase?: string;
  /** 目标备份 checksumSha256，须与备份元数据精确一致。 */
  expectedChecksum?: string;
  expectedChecksumSha256?: string;
  checksumSha256?: string;
}

