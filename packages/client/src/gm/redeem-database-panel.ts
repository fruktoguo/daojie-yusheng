/**
 * gm/redeem-database-panel.ts —— GM 兑换码与数据库面板：兑换码分组 CRUD、数据库备份/恢复/导入。
 *
 * 从 gm.ts 抽取：loadRedeemGroups/loadRedeemGroupDetail/createRedeemGroup/
 * saveRedeemGroup/deleteRedeemGroup/appendRedeemCodes/destroyRedeemCode/
 * loadDatabaseState/exportCurrentDatabase/getSelectedDatabaseImportFile/
 * patchDatabaseImportStatus/isSupportedDatabaseImportFile/
 * updateDatabaseImportFileSelection/uploadDatabaseBackupFile/
 * getDownloadFileName/downloadDatabaseBackup/restoreDatabaseBackup。
 * 对 gm.ts 的依赖通过 RedeemDatabasePanelContext 显式注入。
 */

import {
  type BasicOkRes,
  type GmAppendRedeemCodesReq,
  type GmAppendRedeemCodesRes,
  type GmCreateRedeemCodeGroupReq,
  type GmCreateRedeemCodeGroupRes,
  type GmDatabaseStateRes,
  type GmRedeemCodeGroupDetailRes,
  type GmRedeemCodeGroupListRes,
  type GmRestoreDatabaseReq,
  type GmTriggerDatabaseBackupRes,
  type GmUpdateRedeemCodeGroupReq,
  type GmUploadDatabaseBackupRes,
  type RedeemCodeGroupView,
  GM_HIGH_RISK_CONFIRMATION_PHRASES,
} from '@mud/shared';
import type { RedeemGroupDraft } from './redeem-panel';

/** RedeemDatabasePanelContext：redeem-database-panel 对 gm.ts 的依赖。 */
export interface RedeemDatabasePanelContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  requestBlob(path: string, init?: RequestInit): Promise<Response>;
  setStatus(message: string, isError?: boolean): void;
  t(key: string, params?: Record<string, string | number | boolean>): string;
  formatBytes(bytes: number | undefined): string;
  confirm(message: string): boolean;
  buildGmDatabaseBackupDownloadApiPath(backupId: string): string;
  buildRedeemGroupPayload(): {
    name: string;
    rewards: Array<{ itemId: string; count: number }>;
  };
  createDefaultRedeemGroupDraft(): RedeemGroupDraft;
  renderRedeemPanel(): void;
  renderDatabasePanel(force?: boolean): void;
  getRedeemLoading(): boolean;
  setRedeemLoading(loading: boolean): void;
  getRedeemLatestGeneratedCodes(): string[];
  setRedeemLatestGeneratedCodes(codes: string[]): void;
  getRedeemGroupsState(): RedeemCodeGroupView[];
  setRedeemGroupsState(groups: RedeemCodeGroupView[]): void;
  getSelectedRedeemGroupId(): string | null;
  setSelectedRedeemGroupId(id: string | null): void;
  getRedeemGroupDetailState(): GmRedeemCodeGroupDetailRes | null;
  setRedeemGroupDetailState(detail: GmRedeemCodeGroupDetailRes | null): void;
  getRedeemDraft(): RedeemGroupDraft;
  setRedeemDraft(draft: RedeemGroupDraft): void;
  getDatabaseState(): GmDatabaseStateRes | null;
  setDatabaseState(state: GmDatabaseStateRes | null): void;
  getDatabaseStateLoading(): boolean;
  setDatabaseStateLoading(loading: boolean): void;
  getDatabaseImportBusy(): boolean;
  setDatabaseImportBusy(busy: boolean): void;
  getDatabaseImportStatus(): string;
  setDatabaseImportStatus(status: string): void;
  getSelectedDatabaseImportFile(): File | null;
  setSelectedDatabaseImportFile(file: File | null): void;
  persistentFileInput: HTMLInputElement;
  serverPanelDatabaseEl: HTMLElement;
}
export async function loadRedeemGroups(silent: boolean, ctx: RedeemDatabasePanelContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** ctx.getRedeemLoading()：兑换Loading。 */
  ctx.setRedeemLoading(true);
  ctx.renderRedeemPanel();
  try {
    const data = await ctx.request<GmRedeemCodeGroupListRes>(`${ctx.GM_API_BASE_PATH}/redeem-code-groups`);
    /** ctx.getRedeemGroupsState()：兑换分组状态。 */
    ctx.setRedeemGroupsState(data.groups);
    if (ctx.getSelectedRedeemGroupId() && !ctx.getRedeemGroupsState().some((group) => group.id === ctx.getSelectedRedeemGroupId())) {
      ctx.setSelectedRedeemGroupId(null);
      ctx.setRedeemGroupDetailState(null);
      ctx.setRedeemDraft(ctx.createDefaultRedeemGroupDraft());
    }
    if (!ctx.getSelectedRedeemGroupId() && ctx.getRedeemGroupsState()[0]) {
      ctx.setSelectedRedeemGroupId(ctx.getRedeemGroupsState()[0].id);
    }
    if (ctx.getSelectedRedeemGroupId()) {
      await loadRedeemGroupDetail(ctx.getSelectedRedeemGroupId()!, true, ctx);
    } else {
      ctx.renderRedeemPanel();
    }
    if (!silent) {
      ctx.setStatus(ctx.t('gm.redeem.synced', { count: ctx.getRedeemGroupsState().length }));
    }
  } finally {
    /** ctx.getRedeemLoading()：兑换Loading。 */
    ctx.setRedeemLoading(false);
    ctx.renderRedeemPanel();
  }
}

/** loadRedeemGroupDetail：加载兑换分组详情。 */
export async function loadRedeemGroupDetail(groupId: string, silent: boolean, ctx: RedeemDatabasePanelContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** ctx.getRedeemLoading()：兑换Loading。 */
  ctx.setRedeemLoading(true);
  ctx.renderRedeemPanel();
  try {
    const detail = await ctx.request<GmRedeemCodeGroupDetailRes>(`${ctx.GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(groupId)}`);
    if (ctx.getSelectedRedeemGroupId() !== groupId) {
      return;
    }
    /** ctx.getRedeemGroupDetailState()：兑换分组详情状态。 */
    ctx.setRedeemGroupDetailState(detail);
    ctx.setRedeemDraft({
      name: detail.group.name,
      rewards: detail.group.rewards.map((entry) => ({ ...entry })),
      createCount: '10',
      appendCount: '10',
    });
    if (!silent) {
      ctx.setStatus(ctx.t('gm.redeem.loaded', { groupName: detail.group.name }));
    }
  } finally {
    /** ctx.getRedeemLoading()：兑换Loading。 */
    ctx.setRedeemLoading(false);
    ctx.renderRedeemPanel();
  }
}

/** createRedeemGroup：创建兑换分组。 */
export async function createRedeemGroup(ctx: RedeemDatabasePanelContext): Promise<void> {
  const payloadBase = ctx.buildRedeemGroupPayload();
  const payload: GmCreateRedeemCodeGroupReq = {
    ...payloadBase,
    count: Math.max(1, Math.min(500, Math.floor(Number(ctx.getRedeemDraft().createCount || '0')) || 0)),
  };
  const result = await ctx.request<GmCreateRedeemCodeGroupRes>(`${ctx.GM_API_BASE_PATH}/redeem-code-groups`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  /** ctx.getSelectedRedeemGroupId()：selected兑换分组ID。 */
  ctx.setSelectedRedeemGroupId(result.group.id);
  /** ctx.getRedeemLatestGeneratedCodes()：兑换Latest Generated兑换码。 */
  ctx.setRedeemLatestGeneratedCodes([...result.codes]);
  await loadRedeemGroups(true, ctx);
  ctx.setStatus(ctx.t('gm.redeem.created', { groupName: result.group.name, count: result.codes.length }));
}

/** saveRedeemGroup：保存兑换分组。 */
export async function saveRedeemGroup(ctx: RedeemDatabasePanelContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!ctx.getSelectedRedeemGroupId()) {
    throw new Error(ctx.t('gm.redeem.selected-group-required'));
  }
  const payload: GmUpdateRedeemCodeGroupReq = ctx.buildRedeemGroupPayload();
  await ctx.request<GmRedeemCodeGroupDetailRes>(`${ctx.GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(ctx.getSelectedRedeemGroupId()!)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  /** ctx.getRedeemLatestGeneratedCodes()：兑换Latest Generated兑换码。 */
  ctx.setRedeemLatestGeneratedCodes([]);
  await loadRedeemGroups(true, ctx);
  ctx.setStatus(ctx.t('gm.redeem.saved'));
}

/** deleteRedeemGroup：删除当前兑换分组。 */
export async function deleteRedeemGroup(ctx: RedeemDatabasePanelContext): Promise<void> {
  if (!ctx.getSelectedRedeemGroupId()) {
    throw new Error(ctx.t('gm.redeem.selected-group-required'));
  }
  const groupName = ctx.getRedeemGroupDetailState()?.group.name
    ?? ctx.getRedeemGroupsState().find((group) => group.id === ctx.getSelectedRedeemGroupId())?.name
    ?? (ctx.getSelectedRedeemGroupId() ?? '');
  if (!ctx.confirm(ctx.t('gm.redeem.delete.confirm', { groupName }))) {
    return;
  }
  await ctx.request<BasicOkRes>(`${ctx.GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(ctx.getSelectedRedeemGroupId()!)}`, {
    method: 'DELETE',
  });
  ctx.setSelectedRedeemGroupId(null);
  ctx.setRedeemGroupDetailState(null);
  ctx.setRedeemDraft(ctx.createDefaultRedeemGroupDraft());
  ctx.setRedeemLatestGeneratedCodes([]);
  await loadRedeemGroups(true, ctx);
  ctx.setStatus(ctx.t('gm.redeem.deleted', { groupName }));
}

/** appendRedeemCodes：处理append兑换兑换码。 */
export async function appendRedeemCodes(ctx: RedeemDatabasePanelContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!ctx.getSelectedRedeemGroupId()) {
    throw new Error(ctx.t('gm.redeem.selected-group-required'));
  }
  const payload: GmAppendRedeemCodesReq = {
    count: Math.max(1, Math.min(500, Math.floor(Number(ctx.getRedeemDraft().appendCount || '0')) || 0)),
  };
  const result = await ctx.request<GmAppendRedeemCodesRes>(`${ctx.GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(ctx.getSelectedRedeemGroupId()!)}/codes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  /** ctx.getRedeemLatestGeneratedCodes()：兑换Latest Generated兑换码。 */
  ctx.setRedeemLatestGeneratedCodes([...result.codes]);
  await loadRedeemGroups(true, ctx);
  ctx.setStatus(ctx.t('gm.redeem.appended', { count: result.codes.length }));
}

/** destroyRedeemCode：处理destroy兑换兑换码。 */
export async function destroyRedeemCode(codeId: string, ctx: RedeemDatabasePanelContext): Promise<void> {
  await ctx.request<{  
  /**
 * ok：ok相关字段。
 */
 ok: true }>(`${ctx.GM_API_BASE_PATH}/redeem-codes/${encodeURIComponent(codeId)}`, {
    method: 'DELETE',
  });
  await loadRedeemGroups(true, ctx);
  ctx.setStatus(ctx.t('gm.redeem.destroyed'));
}

/** loadDatabaseState：加载数据库状态。 */
export async function loadDatabaseState(silent: boolean, ctx: RedeemDatabasePanelContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!ctx.getToken()) {
    return;
  }
  /** ctx.getDatabaseStateLoading()：数据库状态Loading。 */
  ctx.setDatabaseStateLoading(true);
  ctx.renderDatabasePanel();
  try {
    const data = await ctx.request<GmDatabaseStateRes>(`${ctx.GM_API_BASE_PATH}/database/state`);
    /** ctx.getDatabaseState()：数据库状态。 */
    ctx.setDatabaseState(data);
    if (!silent) {
      ctx.setStatus(ctx.t('gm.database.synced-backups', { count: data.backups.length }));
    }
  } finally {
    /** ctx.getDatabaseStateLoading()：数据库状态Loading。 */
    ctx.setDatabaseStateLoading(false);
    ctx.renderDatabasePanel();
  }
}

/** exportCurrentDatabase：处理export当前数据库。 */
export async function exportCurrentDatabase(ctx: RedeemDatabasePanelContext): Promise<void> {
  const result = await ctx.request<GmTriggerDatabaseBackupRes>(`${ctx.GM_API_BASE_PATH}/database/backup`, {
    method: 'POST',
  });
  ctx.setStatus(ctx.t('gm.database.export-started', { backupId: result.job.backupId ?? result.job.id }));
  await loadDatabaseState(true, ctx);
}

/** getSelectedDatabaseImportFile：读取数据库导入文件。 */
export function getSelectedDatabaseImportFile(ctx: RedeemDatabasePanelContext): File | null {
  const liveFile = ctx.persistentFileInput.files?.[0] ?? null;
  if (liveFile) {
    ctx.setSelectedDatabaseImportFile(liveFile);
  }
  return liveFile ?? ctx.getSelectedDatabaseImportFile();
}

/** patchDatabaseImportStatus：局部更新数据库导入状态提示。 */
export function patchDatabaseImportStatus(message: string, ctx: RedeemDatabasePanelContext): void {
  ctx.setDatabaseImportStatus(message);
  const statusEl = ctx.serverPanelDatabaseEl.querySelector<HTMLDivElement>('#database-import-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

/** isSupportedDatabaseImportFile：判断数据库导入文件扩展名是否受支持。 */
export function isSupportedDatabaseImportFile(file: File, ctx: RedeemDatabasePanelContext): boolean {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith('.dump') || lowerName.endsWith('.dump.gz');
}

/** updateDatabaseImportFileSelection：处理数据库导入文件选择变化。 */
export function updateDatabaseImportFileSelection(file: File | null, ctx: RedeemDatabasePanelContext): void {
  ctx.setSelectedDatabaseImportFile(file);
  if (!file) {
    patchDatabaseImportStatus(ctx.t('gm.database.import.no-file'), ctx);
    return;
  }

  const fileLabel = `${file.name}（${ctx.formatBytes(file.size)}）`;
  if (!isSupportedDatabaseImportFile(file, ctx)) {
    patchDatabaseImportStatus(ctx.t('gm.database.import.file-selected-unsupported', { fileLabel }), ctx);
    ctx.setStatus(ctx.t('gm.database.import.unsupported'), true);
    return;
  }

  patchDatabaseImportStatus(ctx.t('gm.database.import.file-selected-ready', { fileLabel }), ctx);
  ctx.setStatus(ctx.t('gm.database.import.selected', { fileName: file.name }));
}

/** uploadDatabaseBackupFile：上传数据库备份文件。 */
export async function uploadDatabaseBackupFile(restoreAfterUpload: boolean, ctx: RedeemDatabasePanelContext): Promise<void> {
  const file = getSelectedDatabaseImportFile(ctx);
  if (!file) {
    ctx.setStatus(ctx.t('gm.database.import.choose-file'), true);
    patchDatabaseImportStatus(ctx.t('gm.database.import.no-file'), ctx);
    return;
  }
  if (!isSupportedDatabaseImportFile(file, ctx)) {
    ctx.setStatus(ctx.t('gm.database.import.unsupported'), true);
    patchDatabaseImportStatus(ctx.t('gm.database.import.file-unsupported', { fileName: file.name }), ctx);
    return;
  }
  if (restoreAfterUpload) {
    const confirmed = ctx.confirm(ctx.t('gm.database.import.confirm-upload', { fileName: file.name }));
    if (!confirmed) {
      return;
    }
  }

  ctx.setDatabaseImportBusy(true);
  ctx.setDatabaseImportStatus(ctx.t('gm.database.import.uploading', { fileName: file.name, fileSize: ctx.formatBytes(file.size) }));
  ctx.renderDatabasePanel();
  try {
    const result = await ctx.request<GmUploadDatabaseBackupRes>(`${ctx.GM_API_BASE_PATH}/database/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Backup-Filename': encodeURIComponent(file.name),
        'X-Backup-Size': String(file.size),
      },
      body: file,
    });
    ctx.setSelectedDatabaseImportFile(null);
    ctx.setDatabaseImportStatus(ctx.t('gm.database.import.uploaded-with-size', { fileName: result.backup.fileName, fileSize: ctx.formatBytes(result.backup.sizeBytes) }));
    ctx.setStatus(ctx.t('gm.database.uploaded', { fileName: result.backup.fileName }));
    await loadDatabaseState(true, ctx);
    if (restoreAfterUpload) {
      await restoreDatabaseBackup(result.backup.id, {
        skipConfirm: true,
        fallbackFileName: result.backup.fileName,
        expectedChecksum: result.backup.checksumSha256,
      }, ctx);
    }
  } finally {
    ctx.setDatabaseImportBusy(false);
    ctx.renderDatabasePanel();
  }
}

/** getDownloadFileName：读取Download File名称。 */
export function getDownloadFileName(response: Response, fallback: string, ctx: RedeemDatabasePanelContext): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const header = response.headers.get('content-disposition') ?? '';
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/iu);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const basicMatch = header.match(/filename="?([^";]+)"?/iu);
  return basicMatch?.[1] ?? fallback;
}

/** downloadDatabaseBackup：处理download数据库备份。 */
export async function downloadDatabaseBackup(backupId: string, ctx: RedeemDatabasePanelContext): Promise<void> {
  const response = await ctx.requestBlob(ctx.buildGmDatabaseBackupDownloadApiPath(backupId));
  const blob = await response.blob();
  const fileName = getDownloadFileName(response, `${backupId}.dump`, ctx);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  ctx.setStatus(ctx.t('gm.database.downloaded', { fileName }));
}

/** restoreDatabaseBackup：处理restore数据库备份。 */
export async function restoreDatabaseBackup(
  backupId: string,
  options: {
    skipConfirm?: boolean;
    fallbackFileName?: string;
    expectedChecksum?: string;
  } = {}, ctx: RedeemDatabasePanelContext
): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const backup = ctx.getDatabaseState()?.backups.find((entry) => entry.id === backupId);
  if (!backup && !options.fallbackFileName) {
    ctx.setStatus(ctx.t('gm.database.target-missing'), true);
    return;
  }
  if (backup && backup.format !== 'postgres_custom_dump') {
    ctx.setStatus(ctx.t('gm.database.restore.unsupported-history'), true);
    return;
  }
  const fileName = backup?.fileName ?? options.fallbackFileName ?? backupId;
  const expectedChecksum = (
    typeof options.expectedChecksum === 'string' && options.expectedChecksum.trim()
      ? options.expectedChecksum.trim()
      : typeof backup?.checksumSha256 === 'string'
        ? backup.checksumSha256.trim()
        : ''
  );
  if (!expectedChecksum) {
    ctx.setStatus('目标备份缺少 checksumSha256，无法发起高危恢复确认', true);
    return;
  }
  const confirmed = options.skipConfirm === true
    ? true
    : ctx.confirm(ctx.t('gm.database.restore.confirm', { fileName }));
  if (!confirmed) {
    return;
  }
  const body: GmRestoreDatabaseReq = {
    backupId,
    confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_PHRASES.databaseRestore,
    expectedChecksum,
  };
  const result = await ctx.request<GmTriggerDatabaseBackupRes>(`${ctx.GM_API_BASE_PATH}/database/restore`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  ctx.setStatus(ctx.t('gm.database.restore.started', { backupId: result.job.sourceBackupId ?? fileName }));
  await loadDatabaseState(true, ctx);
}

/** setCpuBreakdownSort：处理set Cpu Breakdown排序。 */
