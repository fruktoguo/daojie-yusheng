/**
 * 本文件属于客户端 GM 工具链，负责地图编辑、世界查看或管理端辅助展示。
 *
 * 维护时要把 GM 能力限定在受控入口，并避免普通玩家客户端路径依赖管理端状态。
 */
/**
 * GM 管理后台前端 —— 登录鉴权、角色列表/编辑器、机器人管理与运营工具
 * 当前作为 GM 独立工具入口继续保留，不并入玩家主线 main.ts，也不作为主线硬切的前台阻塞项。
 */

import {
  type BasicOkRes,
  C2S,
  Direction,
  GM_MAIL_TEMPLATE_OPTIONS,
  type GmChangePasswordReq,
  GM_ACCESS_TOKEN_STORAGE_KEY,
  GM_APPLY_DELAY_MS,
  GM_PANEL_POLL_INTERVAL_MS,
  type GmActivatePlayerEternalBenefitReq,
  type GmAppendRedeemCodesReq,
  type GmAppendRedeemCodesRes,
  type GmBanManagedPlayerReq,
  type GmAddPlayerCombatExpReq,
  type GmAddPlayerFoundationReq,
  type GmCreateRedeemCodeGroupReq,
  type GmCreateRedeemCodeGroupRes,
  type GmDatabaseBackupRecord,
  type GmPlayerDatabaseTableView,
  type GmDatabaseCleanupReq,
  type GmDatabaseStateRes,
  type GmDatabaseTableStatsRes,
  type GmDatabaseCleanupRes,
  type GmDiagnosticsQueryReq,
  type GmDiagnosticsQueryRes,
  type GmDiagnosticsResultSet,
  type GmUploadDatabaseBackupRes,
  type GmCreateMailReq,
  type GmBroadcastMailReq,
  type GmRedeemCodeGroupDetailRes,
  type GmRedeemCodeGroupListRes,
  type GmSetPlayerBodyTrainingLevelReq,
  type GmSetPlayerMonthCardPoolReq,
  type GmCpuSectionSnapshot,
  type GmHeapSnapshotRes,
  type GmHeapSnapshotSummaryRes,
  type GmManualGcRes,
  type GmMemoryDomainEstimateSnapshot,
  type GmMemoryInstanceEstimateSnapshot,
  type GmV8HeapSpaceSnapshot,
  type GmEditorBuffOption,
  type GmEditorCatalogRes,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
  type GmMapListRes,
  type GmMapSummary,
  type GmPlayerUpdateSection,
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  DEFAULT_BASE_ATTRS,
  type AutoBattleSkillConfig,
  ARTIFACT_SLOTS,
  type ArtifactSlot,
  type EquipmentSlots,
  type EquipSlot,
  EQUIP_SLOTS,
  EQUIP_SLOT_LABELS,
  type GmNetworkBucket,
  type GmManagedPlayerSummary,
  type GmPlayerListRes,
  type GmPlayerDetailRes,
  type GmPlayerRiskFactor,
  type GmPlayerRiskLevel,
  type GmLoginReq,
  type GmLoginRes,
  type GmManagedPlayerRecord,
  type GmPlayerAccountStatusFilter,
  type GmPlayerSortMode,
  type GmCompatConversionRunRes,
  type GmRemoveBotsReq,
  type GmRestoreDatabaseReq,
  type GmRestartServerReq,
  type GmHighRiskConfirmationReq,
  GM_ALL_HIGH_RISK_SCOPES,
  GM_HIGH_RISK_CONFIRMATION_PHRASES,
  type GmServerLogEntry,
  type GmServerLogsRes,
  type GmShortcutRunRes,
  type GmSpawnBotsReq,
  type GmStateRes,
  type GmWorkerRow,
  type GmWorkerStateRes,
  type GmEnvCheckResult,
  S2C,
  type GmTriggerDatabaseBackupRes,
  type GmUpdateManagedPlayerAccountReq,
  type GmUpdateManagedPlayerPasswordReq,
  type GmUpdateRedeemCodeGroupReq,
  type GmUpdatePlayerReq,
  type GmUpdatePlayerSnapshot,
  type GmWorldInstanceListRes,
  type GmWorldInstanceSummary,
  type ItemStack,
  type MailAttachment,
  MAIL_TEMPLATE_BEGINNER_JOURNEY_ID,
  MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID,
  MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  type PlayerState,
  type QuestState,
  QUEST_LINE_LABELS,
  QUEST_STATUS_LABELS,
  TECHNIQUE_CATEGORY_LABELS,
  type TechniqueState,
  type TechniqueCategory,
  type TechniqueGrade,
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_REALM_LABELS,
  TechniqueRealm,
  type TemporaryBuffState,
  type RedeemCodeCodeView,
  type RedeemCodeGroupRewardItem,
  type RedeemCodeGroupView,
  type GmEnvironmentVarItem,
  type GmEnvironmentVarListRes,
  type GmSetEnvironmentVarReq,
  type GmReloadEnvironmentVarsRes,
  type GmAiProviderConfigDeleteRes,
  type GmAiProviderDeleteModelRes,
  type GmAiProviderFetchModelsRes,
  type GmAiProviderConfigItem,
  type GmAiProviderConfigListRes,
  type GmAiProviderConfigSetReq,
  type GmAiProviderConfigSetRes,
  type GmAiProviderKind,
  type GmAiProviderModelItem,
  type GmAiProviderTestModelRes,
  type GmAiImageProvider,
  type GmAiTextProvider,
  type GameConfigItem,
  type GameConfigListRes,
  type GameConfigSetRes,
  type GameConfigDeleteRes,
  type GmGeneratedTechniqueDetailRes,
  type GmGeneratedTechniqueListRes,
  type GmGeneratedTechniqueSummary,
  type GmTechniqueGenerationJobDetailRes,
  type GmTechniqueGenerationJobListRes,
  type GmTechniqueGenerationJobSummary,
  type GmMarketTradeItem,
  type GmMarketTradeListQuery,
  type GmMarketTradeListRes,
  expandTechniqueExpCurve,
  getTechniqueExpToNext,
} from '@mud/shared';
import { GmMailBroadcastIdempotencyState } from './gm-mail-broadcast-idempotency';
import {
  GM_FACING_OPTIONS,
  GM_QUEST_LINE_OPTIONS,
  GM_QUEST_OBJECTIVE_TYPE_OPTIONS,
  GM_QUEST_STATUS_OPTIONS,
  GM_TECHNIQUE_REALM_OPTIONS,
} from './constants/world/gm';
import {
  mergeRuntimeFlags,
  groupRuntimeFlags,
  PRESET_FLAGS,
} from './constants/world/gm-runtime-flag-registry';
import { getLocalEditorCatalog } from './content/editor-catalog';
import { resolveTechniqueIdFromBookItemId } from './content/local-templates';
import { GmWorldViewer } from './gm-world-viewer';
import * as gmCatalogHelpers from './gm/helpers/catalog';
import * as gmMarkupHelpers from './gm/helpers/markup';
import * as gmPureHelpers from './gm/helpers/pure';
import { renderGmPlayerListSection } from './gm/helpers/player-list';
import { createGmCustomTechniqueEditor, type GmCustomTechniqueEditor } from './gm/custom-technique-editor';
import {
  GM_API_BASE_PATH,
  GM_AUTH_API_BASE_PATH,
} from './constants/api';
import { applyStaticI18n, t } from './ui/i18n';
import { getCachedMapMeta } from './map-static-cache';
import { startClientVersionReload } from './version-reload';
import {
  clone as formatClone,
  escapeHtml as formatEscapeHtml,
  formatJson as formatFormatJson,
  formatBytes as formatFormatBytes,
  formatSignedBytes as formatFormatSignedBytes,
  formatPercent as formatFormatPercent,
  formatBytesPerSecond as formatFormatBytesPerSecond,
  formatAverageBytesPerEvent as formatFormatAverageBytesPerEvent,
  formatDurationSeconds as formatFormatDurationSeconds,
  formatDateTime as formatFormatDateTime,
  formatPlayerNo as formatFormatPlayerNo,
  formatCpuMs as formatFormatCpuMs,
  formatCpuCount as formatFormatCpuCount,
  formatTrafficCount as formatFormatTrafficCount,
  formatMs as formatFormatMs,
  formatCompactNumber as formatFormatCompactNumber,
  formatWorkerRate as formatFormatWorkerRate,
  isRecord as formatIsRecord,
} from './gm/format';
import {
  buildGmStateApiPath as apiBuildGmStateApiPath,
  buildGmPlayersApiPath as apiBuildGmPlayersApiPath,
  buildGmPlayerApiPath as apiBuildGmPlayerApiPath,
  buildGmGeneratedTechniquesApiPath as apiBuildGmGeneratedTechniquesApiPath,
  buildGmGeneratedTechniqueDetailApiPath as apiBuildGmGeneratedTechniqueDetailApiPath,
  buildGmTechniqueGenerationJobsApiPath as apiBuildGmTechniqueGenerationJobsApiPath,
  buildGmTechniqueGenerationJobDetailApiPath as apiBuildGmTechniqueGenerationJobDetailApiPath,
  buildGmDatabaseBackupDownloadApiPath as apiBuildGmDatabaseBackupDownloadApiPath,
  buildGmServerLogsApiPath as apiBuildGmServerLogsApiPath,
  buildGmWorkersApiPath as apiBuildGmWorkersApiPath,
  buildGmEnvironmentCheckApiPath as apiBuildGmEnvironmentCheckApiPath,
  buildGmDiagnosticsQueryApiPath as apiBuildGmDiagnosticsQueryApiPath,
  getGmToken as apiGetGmToken,
  setGmToken as apiSetGmToken,
  clearGmToken as apiClearGmToken,
  createGmRequest as apiCreateGmRequest,
  createGmRequestBlob as apiCreateGmRequestBlob,
} from './gm/api';
import {
  pathSegments as fieldsPathSegments,
  setValueByPath as fieldsSetValueByPath,
  getValueByPath as fieldsGetValueByPath,
  removeArrayIndex as fieldsRemoveArrayIndex,
  ensureArray as fieldsEnsureArray,
  buildHtmlAttributes as fieldsBuildHtmlAttributes,
  optionsMarkup as fieldsOptionsMarkup,
  textField as fieldsTextField,
  nullableTextField as fieldsNullableTextField,
  numberField as fieldsNumberField,
  checkboxField as fieldsCheckboxField,
  selectField as fieldsSelectField,
  jsonField as fieldsJsonField,
  stringArrayField as fieldsStringArrayField,
  readonlyCodeBlock as fieldsReadonlyCodeBlock,
} from './gm/fields';
import {
  getTechniqueOptionLabel as catalogGetTechniqueOptionLabel,
  getItemOptionLabel as catalogGetItemOptionLabel,
  getBuffOptionLabel as catalogGetBuffOptionLabel,
  getTechniqueCatalogOptions as catalogGetTechniqueCatalogOptions,
  getLearnedTechniqueOptions as catalogGetLearnedTechniqueOptions,
  getRealmCatalogOptions as catalogGetRealmCatalogOptions,
  getItemCatalogOptions as catalogGetItemCatalogOptions,
  getBuffCatalogOptions as catalogGetBuffCatalogOptions,
  getMailAttachmentItemOptions as catalogGetMailAttachmentItemOptions,
  findTechniqueCatalogEntry as catalogFindTechniqueCatalogEntry,
  findItemCatalogEntry as catalogFindItemCatalogEntry,
  findBuffCatalogEntry as catalogFindBuffCatalogEntry,
  createTechniqueFromCatalog as catalogCreateTechniqueFromCatalog,
  createItemFromCatalog as catalogCreateItemFromCatalog,
  createBuffFromCatalog as catalogCreateBuffFromCatalog,
  getTechniqueSummary as catalogGetTechniqueSummary,
  getTechniqueTemplateMaxLevel as catalogGetTechniqueTemplateMaxLevel,
  buildMaxLevelTechniqueState as catalogBuildMaxLevelTechniqueState,
  getInventoryRowMeta as catalogGetInventoryRowMeta,
} from './gm/catalog';
import {
  renderDiagnosticsResultAsTableHtml as diagRenderDiagnosticsResultAsTableHtml,
  renderResultSetTableHtml as diagRenderResultSetTableHtml,
  renderTableCellHtml as diagRenderTableCellHtml,
  diagHistoryLoadFromStorage as diagHistoryLoadFromStorage,
  diagHistoryPushToStorage as diagHistoryPushToStorage,
  diagHistoryNavigateInStorage as diagHistoryNavigateInStorage,
  diagPlayerHistoryLoadFromStorage as diagPlayerHistoryLoadFromStorage,
  diagPlayerHistorySaveToStorage as diagPlayerHistorySaveToStorage,
} from './gm/diagnostics';
import {
  renderEnvironmentVarRowHtml as envConfigRenderEnvironmentVarRowHtml,
  renderGameConfigRowHtml as envConfigRenderGameConfigRowHtml,
  renderGameConfigGroupsHtml as envConfigRenderGameConfigGroupsHtml,
  renderEnvironmentVarGroupsHtml as envConfigRenderEnvironmentVarGroupsHtml,
  renderEnvGroupHtml as envConfigRenderEnvGroupHtml,
} from './gm/env-config';
import {
  resolveMetricTreeSortColumn as perfResolveMetricTreeSortColumn,
  compareMetricTreeSortValues as perfCompareMetricTreeSortValues,
  compareMetricTreeNodes as perfCompareMetricTreeNodes,
  renderMetricTreeHeader as perfRenderMetricTreeHeader,
  renderMetricTreeRows as perfRenderMetricTreeRows,
  renderMetricTreeTable as perfRenderMetricTreeTable,
  getMemoryDomainMeta as perfGetMemoryDomainMeta,
  getMemoryInstanceMeta as perfGetMemoryInstanceMeta,
  getHeapSpaceMeta as perfGetHeapSpaceMeta,
  getPathfindingFailureMeta as perfGetPathfindingFailureMeta,
  renderNetworkLargePayloadSampleHtml as perfRenderNetworkLargePayloadSampleHtml,
} from './gm/perf-panels';
import {
  type CpuBreakdownSortMode,
  type TrafficBreakdownSortMode,
  isCpuBreakdownSortMode as perfIsCpuBreakdownSortMode,
  isTrafficBreakdownSortMode as perfIsTrafficBreakdownSortMode,
  renderCpuBreakdownList as perfRenderCpuBreakdownList,
  renderTrafficBreakdownList as perfRenderTrafficBreakdownList,
} from './gm/perf-extra';
import {
  renderVisualEditor as playerEditorRenderVisualEditor,
  type PlayerEditorRenderDeps as PlayerEditorRenderDeps,
  type PlayerEditorRenderState as PlayerEditorRenderState,
} from './gm/player-editor.render';
import {
  renderTechniqueManager as techniqueManagerRenderTechniqueManager,
  renderTechniqueFilterControls as techniqueManagerRenderTechniqueFilterControls,
  renderTechniqueOverview as techniqueManagerRenderTechniqueOverview,
  renderTechniqueCandidateList as techniqueManagerRenderTechniqueCandidateList,
  renderTechniqueManage as techniqueManagerRenderTechniqueManage,
  renderLearnedTechniqueList as techniqueManagerRenderLearnedTechniqueList,
  renderTechniqueDetails as techniqueManagerRenderTechniqueDetails,
  type GmTechniqueEditorSubtab as TechniqueManagerGmTechniqueEditorSubtab,
  type GmTechniqueCandidateSource as TechniqueManagerGmTechniqueCandidateSource,
  type GmTechniqueCategoryFilter as TechniqueManagerGmTechniqueCategoryFilter,
  type GmTechniqueGradeFilter as TechniqueManagerGmTechniqueGradeFilter,
  type GmTechniqueCandidate as TechniqueManagerGmTechniqueCandidate,
  type TechniqueManagerRenderContext as TechniqueManagerRenderContext,
  GM_TECHNIQUE_CATEGORY_FILTER_OPTIONS as techniqueManagerCategoryFilterOptions,
  GM_TECHNIQUE_GRADE_FILTER_OPTIONS as techniqueManagerGradeFilterOptions,
} from './gm/technique-manager-extra';
import {
  loadEnvironmentVars as envConfigLoadEnvironmentVars,
  reloadEnvironmentVars as envConfigReloadEnvironmentVars,
  toggleAllEnvironmentGroups as envConfigToggleAllEnvironmentGroups,
  loadGameConfig as envConfigLoadGameConfig,
  renderGameConfig as envConfigRenderGameConfig,
  toggleAllGameConfigGroups as envConfigToggleAllGameConfigGroups,
  loadAiProviderConfigs as envConfigLoadAiProviderConfigs,
  addAiProviderConfig as envConfigAddAiProviderConfig,
  initEnvConfigEventBindings as envConfigInitEventBindings,
  type EnvConfigContext as EnvConfigContext,
} from './gm/env-config-extra';
import {
  getSearchableItemDisplayValue as invEditorGetSearchableItemDisplayValue,
  getSearchableItemOptions as invEditorGetSearchableItemOptions,
  searchableItemField as invEditorSearchableItemField,
  getSearchableItemValueField as invEditorGetSearchableItemValueField,
  getSearchableItemInput as invEditorGetSearchableItemInput,
  getSearchableItemList as invEditorGetSearchableItemList,
  getSearchableItemHint as invEditorGetSearchableItemHint,
  getSearchableItemPopover as invEditorGetSearchableItemPopover,
  normalizeSearchableItemText as invEditorNormalizeSearchableItemText,
  renderSearchableItemOptions as invEditorRenderSearchableItemOptions,
  syncSearchableItemField as invEditorSyncSearchableItemField,
  syncSearchableItemFields as invEditorSyncSearchableItemFields,
  closeSearchableItemField as invEditorCloseSearchableItemField,
  openSearchableItemField as invEditorOpenSearchableItemField,
  moveSearchableItemActiveIndex as invEditorMoveSearchableItemActiveIndex,
  commitSearchableItemSelection as invEditorCommitSearchableItemSelection,
  type InventoryEditorContext as InventoryEditorContext,
} from './gm/inventory-editor';
import {
  removeSelectedBot as adminRemoveSelectedBot,
  spawnBots as adminSpawnBots,
  removeAllBots as adminRemoveAllBots,
  returnAllPlayersToDefaultSpawn as adminReturnAllPlayersToDefaultSpawn,
  cleanupAllPlayersInvalidItems as adminCleanupAllPlayersInvalidItems,
  migrateAllPlayersRecoveryPills as adminMigrateAllPlayersRecoveryPills,
  repairMarketStorageItemIds as adminRepairMarketStorageItemIds,
  migrateAiArtsStrengthDraftsV1ToV2 as adminMigrateAiArtsStrengthDraftsV1ToV2,
  deleteEmptyCustomTechniqueBooks as adminDeleteEmptyCustomTechniqueBooks,
  recoverEmptyCustomTechniqueBooks as adminRecoverEmptyCustomTechniqueBooks,
  repairQuestProgressPayloads as adminRepairQuestProgressPayloads,
  refreshOnlineTechniqueTemplates as adminRefreshOnlineTechniqueTemplates,
  refillOnlineAndOfflineHangingPlayersStamina as adminRefillOnlineAndOfflineHangingPlayersStamina,
  cleanupAbnormalTemporaryTiles as adminCleanupAbnormalTemporaryTiles,
  compensateAllPlayersCombatExp as adminCompensateAllPlayersCombatExp,
  compensateAllPlayersFoundation as adminCompensateAllPlayersFoundation,
  resetNetworkStats as adminResetNetworkStats,
  toggleNetworkPayloadCapture as adminToggleNetworkPayloadCapture,
  activateNetworkStats as adminActivateNetworkStats,
  ensureNetworkStatsActive as adminEnsureNetworkStatsActive,
  resetCpuStats as adminResetCpuStats,
  resetPathfindingStats as adminResetPathfindingStats,
  triggerManualGc as adminTriggerManualGc,
  writeHeapSnapshot as adminWriteHeapSnapshot,
  writeAndCopyHeapSnapshotSummary as adminWriteAndCopyHeapSnapshotSummary,
  copyLatestHeapSnapshotSummary as adminCopyLatestHeapSnapshotSummary,
  type AdminShortcutsContext as AdminShortcutsContext,
} from './gm/admin-shortcuts';
import {
  buildGeneratedTechniqueListQueryParams as genTechBuildListQueryParams,
  buildTechniqueGenerationJobListQueryParams as genTechBuildJobListQueryParams,
  applyGeneratedTechniqueSubtabVisibility as genTechApplySubtabVisibility,
  switchGeneratedTechniqueSubtab as genTechSwitchSubtab,
  loadCurrentGeneratedTechniqueSubtab as genTechLoadCurrentSubtab,
  loadGeneratedTechniques as genTechLoadTechniques,
  renderGeneratedTechniquePanel as genTechRenderPanel,
  renderGeneratedTechniqueRow as genTechRenderRow,
  renderGeneratedTechniqueDetail as genTechRenderDetail,
  loadGeneratedTechniqueDetail as genTechLoadDetail,
  getGeneratedTechniqueGradeLabel as genTechGetGradeLabel,
  loadTechniqueGenerationJobs as genTechLoadJobs,
  renderTechniqueGenerationJobPanel as genTechRenderJobPanel,
  renderTechniqueGenerationJobRow as genTechRenderJobRow,
  renderTechniqueGenerationJobDetail as genTechRenderJobDetail,
  loadTechniqueGenerationJobDetail as genTechLoadJobDetail,
  formatTechniqueGenerationJobItemState as genTechFormatJobItemState,
  formatTechniqueGenerationJobPlayerLabel as genTechFormatJobPlayerLabel,
  formatTechniqueGenerationJobStatus as genTechFormatJobStatus,
  handleGeneratedTechniquePanelLoadError as genTechHandleLoadError,
  type GeneratedTechniqueContext as GeneratedTechniqueContext,
} from './gm/generated-technique';
import {
  loadTrades as tradesPanelLoadTrades,
  renderTrades as tradesPanelRenderTrades,
  renderTradeRow as tradesPanelRenderTradeRow,
  formatTradePartyLabel as tradesPanelFormatTradePartyLabel,
  formatTradePrice as tradesPanelFormatTradePrice,
  formatTradeTimestamp as tradesPanelFormatTradeTimestamp,
  type TradesPanelContext as TradesPanelContext,
  type TradesQueryState as TradesQueryState,
} from './gm/trades-panel';
import {
  diagHistoryLoad as diagPanelDiagHistoryLoad,
  diagHistoryPush as diagPanelDiagHistoryPush,
  diagHistoryNavigate as diagPanelDiagHistoryNavigate,
  renderDiagnosticsPanel as diagPanelRenderDiagnosticsPanel,
  updateUndoButton as diagPanelUpdateUndoButton,
  renderDiagnosticsResultAsTable as diagPanelRenderDiagnosticsResultAsTable,
  renderResultSetTable as diagPanelRenderResultSetTable,
  renderTableCell as diagPanelRenderTableCell,
  diagPlayerHistoryLoad as diagPanelDiagPlayerHistoryLoad,
  diagPlayerHistorySave as diagPanelDiagPlayerHistorySave,
  showDiagPrompt as diagPanelShowDiagPrompt,
  startDiagCellEdit as diagPanelStartDiagCellEdit,
  inferTableName as diagPanelInferTableName,
  buildWhereFromRow as diagPanelBuildWhereFromRow,
  runDiagnosticsCommand as diagPanelRunDiagnosticsCommand,
  type DiagnosticsPanelContext as DiagnosticsPanelContext,
} from './gm/diagnostics-panel';
import {
  getWorkerRowMarkup as workerHelpersGetWorkerRowMarkup,
  getWorkerWindowMetricLabel as workerHelpersGetWorkerWindowMetricLabel,
  getWorkerStatusLabel as workerHelpersGetWorkerStatusLabel,
  getWorkerTopologyMarkup as workerHelpersGetWorkerTopologyMarkup,
  getWorkerSchedulerMarkup as workerHelpersGetWorkerSchedulerMarkup,
  getWorkerAlertLabel as workerHelpersGetWorkerAlertLabel,
  getSchedulerDiagnosticNote as workerHelpersGetSchedulerDiagnosticNote,
  getAlertInactiveDiagnostic as workerHelpersGetAlertInactiveDiagnostic,
  getWorkerCapacityMarkup as workerHelpersGetWorkerCapacityMarkup,
  formatWorkerFailureBreakdown as workerHelpersFormatWorkerFailureBreakdown,
  formatMs as workerHelpersFormatMs,
  formatCompactNumber as workerHelpersFormatCompactNumber,
  formatWorkerRate as workerHelpersFormatWorkerRate,
  countWorkerRows as workerHelpersCountWorkerRows,
  sumWorkerRows as workerHelpersSumWorkerRows,
  formatDatabaseBackupKind as workerHelpersFormatDatabaseBackupKind,
  formatDatabaseBackupFormat as workerHelpersFormatDatabaseBackupFormat,
  type WorkerHelpersContext as WorkerHelpersContext,
} from './gm/worker-helpers';
import {
  renderWorkerPoolSection as serverPanelsExtraRenderWorkerPoolSection,
  renderWorkerPanel as serverPanelsExtraRenderWorkerPanel,
  loadWorkerState as serverPanelsExtraLoadWorkerState,
  getEnvCheckStatusText as serverPanelsExtraGetEnvCheckStatusText,
  getEnvCheckStatusIcon as serverPanelsExtraGetEnvCheckStatusIcon,
  renderEnvCheckPanel as serverPanelsExtraRenderEnvCheckPanel,
  loadEnvCheck as serverPanelsExtraLoadEnvCheck,
  loadRuntimeFlags as serverPanelsExtraLoadRuntimeFlags,
  toggleRuntimeFlag as serverPanelsExtraToggleRuntimeFlag,
  addRuntimeFlag as serverPanelsExtraAddRuntimeFlag,
  deleteRuntimeFlag as serverPanelsExtraDeleteRuntimeFlag,
  setMaintenanceMode as serverPanelsExtraSetMaintenanceMode,
  restartServer as serverPanelsExtraRestartServer,
  renderRuntimeFlagsPanel as serverPanelsExtraRenderRuntimeFlagsPanel,
  buildRuntimeFlagsHtml as serverPanelsExtraBuildRuntimeFlagsHtml,
  bindRuntimeFlagsEvents as serverPanelsExtraBindRuntimeFlagsEvents,
  renderObjectsPanel as serverPanelsExtraRenderObjectsPanel,
  loadObjectCounts as serverPanelsExtraLoadObjectCounts,
  type ServerPanelsExtraContext as ServerPanelsExtraContext,
} from './gm/server-panels-extra';
import {
  loadRedeemGroups as redeemDbPanelLoadRedeemGroups,
  loadRedeemGroupDetail as redeemDbPanelLoadRedeemGroupDetail,
  createRedeemGroup as redeemDbPanelCreateRedeemGroup,
  saveRedeemGroup as redeemDbPanelSaveRedeemGroup,
  deleteRedeemGroup as redeemDbPanelDeleteRedeemGroup,
  appendRedeemCodes as redeemDbPanelAppendRedeemCodes,
  destroyRedeemCode as redeemDbPanelDestroyRedeemCode,
  loadDatabaseState as redeemDbPanelLoadDatabaseState,
  exportCurrentDatabase as redeemDbPanelExportCurrentDatabase,
  getSelectedDatabaseImportFile as redeemDbPanelGetSelectedDatabaseImportFile,
  patchDatabaseImportStatus as redeemDbPanelPatchDatabaseImportStatus,
  isSupportedDatabaseImportFile as redeemDbPanelIsSupportedDatabaseImportFile,
  updateDatabaseImportFileSelection as redeemDbPanelUpdateDatabaseImportFileSelection,
  uploadDatabaseBackupFile as redeemDbPanelUploadDatabaseBackupFile,
  getDownloadFileName as redeemDbPanelGetDownloadFileName,
  downloadDatabaseBackup as redeemDbPanelDownloadDatabaseBackup,
  restoreDatabaseBackup as redeemDbPanelRestoreDatabaseBackup,
  type RedeemDatabasePanelContext as RedeemDatabasePanelContext,
} from './gm/redeem-database-panel';
import {
  updateMailDraftValue as mailActionsUpdateMailDraftValue,
  updateRedeemDraftValue as mailActionsUpdateRedeemDraftValue,
  rerenderDirectMailComposer as mailActionsRerenderDirectMailComposer,
  addMailAttachment as mailActionsAddMailAttachment,
  removeMailAttachment as mailActionsRemoveMailAttachment,
  sendDirectMail as mailActionsSendDirectMail,
  sendShortcutMail as mailActionsSendShortcutMail,
  type MailActionsContext as MailActionsContext,
} from './gm/mail-actions';
import {
  formatServerLogLine as serverLogsPanelFormatServerLogLine,
  renderServerLogsPanel as serverLogsPanelRenderServerLogsPanel,
  loadServerLogs as serverLogsPanelLoadServerLogs,
  type ServerLogsPanelContext as ServerLogsPanelContext,
} from './gm/server-logs-panel';
import {
  renderObjectsPanelHtml as serverPanelsRenderObjectsPanelHtml,
  renderObjectsPanelMeta as serverPanelsRenderObjectsPanelMeta,
  buildRuntimeFlagsHtml as serverPanelsBuildRuntimeFlagsHtml,
  type ObjectCountsResponse as ServerPanelsObjectCountsResponse,
} from './gm/server-panels';
import { getMailComposerMarkupHtml as mailComposerGetMailComposerMarkupHtml, type GmMailComposerDraft as MailComposerGmMailComposerDraft, type GmMailAttachmentDraft as MailComposerGmMailAttachmentDraft } from './gm/mail-composer';
import { renderTableStatsContentHtml as databasePanelRenderTableStatsContentHtml, renderBackupListHtml as databasePanelRenderBackupListHtml } from './gm/database-panel';
import { renderPositionMapPickerHtml as mapPickerRenderPositionMapPickerHtml } from './gm/map-picker';
import {
  renderRedeemGroupListHtml as redeemPanelRenderRedeemGroupListHtml,
  renderRedeemGroupEditorHtml as redeemPanelRenderRedeemGroupEditorHtml,
  renderRedeemCodeListHtml as redeemPanelRenderRedeemCodeListHtml,
  type RedeemGroupDraft as RedeemPanelRedeemGroupDraft,
  type RedeemPanelDeps as RedeemPanelDeps,
} from './gm/redeem-panel';
import {
  resolveAiProviderSelectedModelName as aiProviderResolveSelectedModelName,
  normalizeAiProviderModelSelection as aiProviderNormalizeModelSelection,
  getAiModelStateKey as aiProviderGetModelStateKey,
  renderAiProviderConfigRowHtml as aiProviderRenderConfigRowHtml,
  renderAiProviderModelRowHtml as aiProviderRenderModelRowHtml,
  type AiModelTestState as AiProviderModelTestState,
  type AiProviderDeps as AiProviderDeps,
} from './gm/ai-provider';
import type {
  MetricTreeSortDirection as PerfMetricTreeSortDirection,
  MetricTreeColumn as PerfMetricTreeColumn,
  MetricTreeTableOptions as PerfMetricTreeTableOptions,
} from './gm/perf-panels';
import {
  getPlayerPresenceMeta as riskGetPlayerPresenceMeta,
  getManagedAccountStatusLabel as riskGetManagedAccountStatusLabel,
  getManagedAccountActivityMeta as riskGetManagedAccountActivityMeta,
  getManagedPlayerAccountStatusLabel as riskGetManagedPlayerAccountStatusLabel,
  getManagedAccountRestrictionLabel as riskGetManagedAccountRestrictionLabel,
  getManagedAccountRestrictionPillClass as riskGetManagedAccountRestrictionPillClass,
  getPlayerRiskLevelLabel as riskGetPlayerRiskLevelLabel,
  getPlayerRiskLevelPillClass as riskGetPlayerRiskLevelPillClass,
  renderPlayerRiskFactorCard as riskRenderPlayerRiskFactorCard,
  renderPlayerRiskSection as riskRenderPlayerRiskSection,
} from './gm/player-risk';
import {
  getVisibleNetworkBuckets as statGetVisibleNetworkBuckets,
  getNetworkBucketMeta as statGetNetworkBucketMeta,
  getTickPerf as statGetTickPerf,
  getStatRowMarkup as statGetStatRowMarkup,
  patchStatRow as statPatchStatRow,
  renderStructuredStatList as statRenderStructuredStatList,
  rememberNetworkLargePayloadBuckets as statRememberNetworkLargePayloadBuckets,
  renderNetworkLargePayloadSample as statRenderNetworkLargePayloadSample,
  closeNetworkPayloadModal as statCloseNetworkPayloadModal,
  openNetworkPayloadModal as statOpenNetworkPayloadModal,
  type StructuredStatListItem as StatStructuredStatListItem,
} from './gm/stat-rows';
import {
  createDefaultItem as snapshotCreateDefaultItem,
  createDefaultTechnique as snapshotCreateDefaultTechnique,
  createDefaultQuest as snapshotCreateDefaultQuest,
  createDefaultBuff as snapshotCreateDefaultBuff,
  normalizeGmEquipmentSlots as snapshotNormalizeGmEquipmentSlots,
  getArtifactSlotLabel as snapshotGetArtifactSlotLabel,
  createDefaultArtifactSlot as snapshotCreateDefaultArtifactSlot,
  normalizeGmArtifactState as snapshotNormalizeGmArtifactState,
  createDefaultPlayerSnapshot as snapshotCreateDefaultPlayerSnapshot,
  getPlayerDatabaseTables as snapshotGetPlayerDatabaseTables,
  buildTechniqueSaveSnapshot as snapshotBuildTechniqueSaveSnapshot,
  buildInventoryItemSaveSnapshot as snapshotBuildInventoryItemSaveSnapshot,
  buildEquipmentItemSaveSnapshot as snapshotBuildEquipmentItemSaveSnapshot,
  buildArtifactSlotSaveSnapshot as snapshotBuildArtifactSlotSaveSnapshot,
  buildSectionSnapshot as snapshotBuildSectionSnapshot,
} from './gm/player-snapshot';
import {
  isGmSectTemplateId as mapIsGmSectTemplateId,
  isGmSectRuntimeInstance as mapIsGmSectRuntimeInstance,
  isGmSecretRealmRuntimeInstance as mapIsGmSecretRealmRuntimeInstance,
  resolvePositionMapCategory as mapResolvePositionMapCategory,
  getMapSummary as mapGetMapSummary,
  getMapDisplayName as mapGetMapDisplayName,
  getPositionMapCategoryCounts as mapGetPositionMapCategoryCounts,
  getPositionCategoryOptions as mapGetPositionCategoryOptions,
  getPositionMapInstances as mapGetPositionMapInstances,
  getPositionMapOptions as mapGetPositionMapOptions,
  getPositionCategoryForMap as mapGetPositionCategoryForMap,
  patchPositionMapSelect as mapPatchPositionMapSelect,
  resolvePositionTargetInstanceId as mapResolvePositionTargetInstanceId,
  GM_POSITION_MAP_CATEGORY_OPTIONS as mapGmPositionMapCategoryOptions,
  type GmPositionMapCategory as MapGmPositionMapCategory,
} from './gm/map-location';
import {
  getEditorTabLabel as editorGetEditorTabLabel,
  setTextLikeValue as editorSetTextLikeValue,
  renderEditorTabSection as editorRenderEditorTabSection,
  getAttrDisplayNumber as editorGetAttrDisplayNumber,
  normalizeInventorySearchText as editorNormalizeInventorySearchText,
  buildCraftSkillSaveSnapshot as editorBuildCraftSkillSaveSnapshot,
  getTechniqueCategoryDisplayLabel as editorGetTechniqueCategoryDisplayLabel,
  getTechniqueGradeDisplayLabel as editorGetTechniqueGradeDisplayLabel,
  normalizeTechniquePageSize as editorNormalizeTechniquePageSize,
  renderAttributeSummaryGrid as editorRenderAttributeSummaryGrid,
  type GmEditorTab as EditorGmEditorTab,
} from './gm/editor-helpers';
import {
  getGeneratedTechniqueGradeLabel as genGetGeneratedTechniqueGradeLabel,
  formatTechniqueGenerationJobItemState as genFormatTechniqueGenerationJobItemState,
  formatTechniqueGenerationJobPlayerLabel as genFormatTechniqueGenerationJobPlayerLabel,
  formatTechniqueGenerationJobStatus as genFormatTechniqueGenerationJobStatus,
  formatTradePartyLabel as genFormatTradePartyLabel,
  formatTradePrice as genFormatTradePrice,
  formatTradeTimestamp as genFormatTradeTimestamp,
  renderGeneratedTechniqueRow as genRenderGeneratedTechniqueRow,
  renderTechniqueGenerationJobRow as genRenderTechniqueGenerationJobRow,
  renderTradeRow as genRenderTradeRow,
} from './gm/gen-technique-format';
import {
  getLearnedTechniqueIdSet as techGetLearnedTechniqueIdSet,
  paginateTechniqueEntries as techPaginateTechniqueEntries,
  getTechniqueRealmLvFilterValue as techGetTechniqueRealmLvFilterValue,
  getTechniqueRealmLevelDisplayLabel as techGetTechniqueRealmLevelDisplayLabel,
  getTechniqueCategoryCounts as techGetTechniqueCategoryCounts,
  buildTechniqueCandidateMeta as techBuildTechniqueCandidateMeta,
  matchesTechniqueFilters as techMatchesTechniqueFilters,
  getFilteredLearnedTechniques as techGetFilteredLearnedTechniques,
  buildSystemTechniqueCandidates as techBuildSystemTechniqueCandidates,
  buildGeneratedTechniqueCandidates as techBuildGeneratedTechniqueCandidates,
  getFilteredSystemTechniqueCandidates as techGetFilteredSystemTechniqueCandidates,
  type TechniqueFilterState as TechTechniqueFilterState,
} from './gm/technique-helpers';

const GM_PLAYER_QUICK_RESET_PASSWORD = '123456789';

applyStaticI18n(document);

/** loginOverlay：login Overlay。 */
const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
/** gmShell：GM Shell。 */
const gmShell = document.getElementById('gm-shell') as HTMLDivElement;
/** loginForm：login Form。 */
const loginForm = document.getElementById('gm-login-form') as HTMLFormElement;
/** passwordInput：密码输入。 */
const passwordInput = document.getElementById('gm-password') as HTMLInputElement;
/** loginSubmitBtn：login Submit Btn。 */
const loginSubmitBtn = document.getElementById('login-submit') as HTMLButtonElement;
/** loginErrorEl：login错误El。 */
const loginErrorEl = document.getElementById('login-error') as HTMLDivElement;
/** statusBarEl：状态Bar El。 */
const statusBarEl = document.getElementById('status-bar') as HTMLDivElement;
/** statusToastEl：状态Toast El。 */
const statusToastEl = document.getElementById('status-toast') as HTMLDivElement;
/** playerSearchInput：玩家搜索输入。 */
const playerSearchInput = document.getElementById('player-search') as HTMLInputElement;
/** playerSortSelect：玩家排序Select。 */
const playerSortSelect = document.getElementById('player-sort') as HTMLSelectElement;
/** playerAccountStatusFilterSelect：玩家账号状态筛选。 */
const playerAccountStatusFilterSelect = document.getElementById('player-account-status-filter') as HTMLSelectElement;
/** playerListEl：玩家列表El。 */
const playerListEl = document.getElementById('player-list') as HTMLDivElement;
/** playerPrevPageBtn：玩家Prev分页Btn。 */
const playerPrevPageBtn = document.getElementById('player-page-prev') as HTMLButtonElement;
/** playerNextPageBtn：玩家新版分页Btn。 */
const playerNextPageBtn = document.getElementById('player-page-next') as HTMLButtonElement;
/** playerPageMetaEl：玩家分页元数据El。 */
const playerPageMetaEl = document.getElementById('player-page-meta') as HTMLDivElement;
/** spawnCountInput：生成数量输入。 */
const spawnCountInput = document.getElementById('spawn-count') as HTMLInputElement;
/** editorEmptyEl：编辑器Empty El。 */
const editorEmptyEl = document.getElementById('editor-empty') as HTMLDivElement;
/** editorPanelEl：编辑器面板El。 */
const editorPanelEl = document.getElementById('editor-panel') as HTMLDivElement;
/** editorTitleEl：编辑器标题El。 */
const editorTitleEl = document.getElementById('editor-title') as HTMLDivElement;
/** editorSubtitleEl：编辑器Subtitle El。 */
const editorSubtitleEl = document.getElementById('editor-subtitle') as HTMLDivElement;
/** editorMetaEl：编辑器元数据El。 */
const editorMetaEl = document.getElementById('editor-meta') as HTMLDivElement;
/** editorContentEl：编辑器Content El。 */
const editorContentEl = document.getElementById('editor-content') as HTMLDivElement;
/** editorVisualPanelEl：编辑器Visual面板El。 */
const editorVisualPanelEl = document.getElementById('editor-visual-panel') as HTMLDivElement;
/** editorPersistedPanelEl：编辑器Persisted面板El。 */
const editorPersistedPanelEl = document.getElementById('editor-persisted-panel') as HTMLDivElement;
/** editorTabBasicBtn：编辑器Tab Basic Btn。 */
const editorTabBasicBtn = document.getElementById('editor-tab-basic') as HTMLButtonElement;
/** editorTabPositionBtn：编辑器Tab位置Btn。 */
const editorTabPositionBtn = document.getElementById('editor-tab-position') as HTMLButtonElement;
/** editorTabRealmBtn：编辑器Tab境界Btn。 */
const editorTabRealmBtn = document.getElementById('editor-tab-realm') as HTMLButtonElement;
/** editorTabBuffsBtn：编辑器Tab Buff Btn。 */
const editorTabBuffsBtn = document.getElementById('editor-tab-buffs') as HTMLButtonElement;
/** editorTabTechniquesBtn：编辑器Tab Techniques Btn。 */
const editorTabTechniquesBtn = document.getElementById('editor-tab-techniques') as HTMLButtonElement;
const editorTabCraftSkillsBtn = document.getElementById('editor-tab-craft-skills') as HTMLButtonElement;
const editorTabBenefitsBtn = document.getElementById('editor-tab-benefits') as HTMLButtonElement;
/** editorTabShortcutsBtn：编辑器Tab Shortcuts Btn。 */
const editorTabShortcutsBtn = document.getElementById('editor-tab-shortcuts') as HTMLButtonElement;
/** editorTabItemsBtn：编辑器Tab物品Btn。 */
const editorTabItemsBtn = document.getElementById('editor-tab-items') as HTMLButtonElement;
/** editorTabQuestsBtn：编辑器Tab Quests Btn。 */
const editorTabQuestsBtn = document.getElementById('editor-tab-quests') as HTMLButtonElement;
/** editorTabMailBtn：编辑器Tab邮件Btn。 */
const editorTabMailBtn = document.getElementById('editor-tab-mail') as HTMLButtonElement;
/** editorTabRiskBtn：编辑器Tab风险Btn。 */
const editorTabRiskBtn = document.getElementById('editor-tab-risk') as HTMLButtonElement;
/** editorTabPersistedBtn：编辑器Tab Persisted Btn。 */
const editorTabPersistedBtn = document.getElementById('editor-tab-persisted') as HTMLButtonElement;
/** playerPersistedJsonEl：玩家Persisted JSON El。 */
const playerPersistedJsonEl = document.getElementById('player-persisted-json') as HTMLTextAreaElement;
/** playerDatabaseTabsEl：玩家数据库Tabs。 */
const playerDatabaseTabsEl = document.getElementById('player-database-tabs') as HTMLDivElement;
/** playerDatabaseMetaEl：玩家数据库元数据。 */
const playerDatabaseMetaEl = document.getElementById('player-database-meta') as HTMLDivElement;
/** savePlayerBtn：保存玩家Btn。 */
const savePlayerBtn = document.getElementById('save-player') as HTMLButtonElement;
/** refreshPlayerBtn：refresh玩家Btn。 */
const refreshPlayerBtn = document.getElementById('refresh-player') as HTMLButtonElement;
/** openPlayerMailBtn：open玩家邮件Btn。 */
const openPlayerMailBtn = document.getElementById('open-player-mail') as HTMLButtonElement;
/** resetPlayerBtn：reset玩家Btn。 */
const resetPlayerBtn = document.getElementById('reset-player') as HTMLButtonElement;
/** resetHeavenGateBtn：reset Heaven关卡Btn。 */
const resetHeavenGateBtn = document.getElementById('reset-heaven-gate') as HTMLButtonElement;
/** removeBotBtn：remove Bot Btn。 */
const removeBotBtn = document.getElementById('remove-bot') as HTMLButtonElement;
/** toggleMaintenanceModeBtn：切换维护态按钮。 */
const toggleMaintenanceModeBtn = document.getElementById('toggle-maintenance-mode') as HTMLButtonElement;
/** restartServerBtn：重启服务器按钮。 */
const restartServerBtn = document.getElementById('restart-server') as HTMLButtonElement;

/** summaryTotalEl：摘要总量El。 */
const summaryTotalEl = document.getElementById('summary-total') as HTMLDivElement;
/** summaryOnlineEl：摘要Online El。 */
const summaryOnlineEl = document.getElementById('summary-online') as HTMLDivElement;
/** summaryOfflineHangingEl：摘要Offline Hanging El。 */
const summaryOfflineHangingEl = document.getElementById('summary-offline-hanging') as HTMLDivElement;
/** summaryOfflineEl：摘要Offline El。 */
const summaryOfflineEl = document.getElementById('summary-offline') as HTMLDivElement;
/** summaryMaintenanceEl：摘要维护态 El。 */
const summaryMaintenanceEl = document.getElementById('summary-maintenance') as HTMLDivElement;
/** summaryBotsEl：摘要Bots El。 */
const summaryBotsEl = document.getElementById('summary-bots') as HTMLDivElement;
/** summaryTickEl：摘要Tick El。 */
const summaryTickEl = document.getElementById('summary-tick') as HTMLDivElement;
/** summaryTickWindowEl：摘要Tick窗口El。 */
const summaryTickWindowEl = document.getElementById('summary-tick-window') as HTMLDivElement;
/** summaryCpuEl：摘要Cpu El。 */
const summaryCpuEl = document.getElementById('summary-cpu') as HTMLDivElement;
/** summaryMemoryEl：摘要Memory El。 */
const summaryMemoryEl = document.getElementById('summary-memory') as HTMLDivElement;
/** summaryNetInEl：摘要Net In El。 */
const summaryNetInEl = document.getElementById('summary-net-in') as HTMLDivElement;
/** summaryNetOutEl：摘要Net Out El。 */
const summaryNetOutEl = document.getElementById('summary-net-out') as HTMLDivElement;
/** summaryPathQueueEl：摘要路径队列El。 */
const summaryPathQueueEl = document.getElementById('summary-path-queue') as HTMLDivElement;
/** summaryPathWorkersEl：摘要路径Workers El。 */
const summaryPathWorkersEl = document.getElementById('summary-path-workers') as HTMLDivElement;
/** summaryPathCancelledEl：摘要路径Cancelled El。 */
const summaryPathCancelledEl = document.getElementById('summary-path-cancelled') as HTMLDivElement;
/** summaryNetInBreakdownEl：摘要Net In Breakdown El。 */
const summaryNetInBreakdownEl = document.getElementById('summary-net-in-breakdown') as HTMLDivElement;
/** summaryNetOutBreakdownEl：摘要Net Out Breakdown El。 */
const summaryNetOutBreakdownEl = document.getElementById('summary-net-out-breakdown') as HTMLDivElement;
/** serverSubtabOverviewBtn：服务端Subtab Overview Btn。 */
const serverSubtabOverviewBtn = document.getElementById('server-subtab-overview') as HTMLButtonElement;
/** serverSubtabTrafficBtn：服务端Subtab Traffic Btn。 */
const serverSubtabTrafficBtn = document.getElementById('server-subtab-traffic') as HTMLButtonElement;
/** serverSubtabCpuBtn：服务端Subtab Cpu Btn。 */
const serverSubtabCpuBtn = document.getElementById('server-subtab-cpu') as HTMLButtonElement;
/** serverSubtabMemoryBtn：服务端Subtab Memory Btn。 */
const serverSubtabMemoryBtn = document.getElementById('server-subtab-memory') as HTMLButtonElement;
/** serverSubtabDatabaseBtn：服务端Subtab数据库Btn。 */
const serverSubtabDatabaseBtn = document.getElementById('server-subtab-database') as HTMLButtonElement;
/** serverSubtabLogsBtn：服务端Subtab日志Btn。 */
const serverSubtabLogsBtn = document.getElementById('server-subtab-logs') as HTMLButtonElement;
/** serverSubtabWorkersBtn：服务端Subtab Workers Btn。 */
const serverSubtabWorkersBtn = document.getElementById('server-subtab-workers') as HTMLButtonElement;
/** serverSubtabEnvCheckBtn：服务端环境检测子标签按钮。 */
const serverSubtabEnvCheckBtn = document.getElementById('server-subtab-env-check') as HTMLButtonElement;
/** serverPanelOverviewEl：服务端面板Overview El。 */
const serverPanelOverviewEl = document.getElementById('server-panel-overview') as HTMLElement;
/** serverPanelTrafficEl：服务端面板Traffic El。 */
const serverPanelTrafficEl = document.getElementById('server-panel-traffic') as HTMLElement;
/** serverPanelCpuEl：服务端面板Cpu El。 */
const serverPanelCpuEl = document.getElementById('server-panel-cpu') as HTMLElement;
/** serverPanelMemoryEl：服务端面板Memory El。 */
const serverPanelMemoryEl = document.getElementById('server-panel-memory') as HTMLElement;
/** serverPanelDatabaseEl：服务端面板数据库El。 */
const serverPanelDatabaseEl = document.getElementById('server-panel-database') as HTMLElement;
/** serverPanelLogsEl：服务端面板日志El。 */
const serverPanelLogsEl = document.getElementById('server-panel-logs') as HTMLElement;
/** serverPanelWorkersEl：服务端面板Workers El。 */
const serverPanelWorkersEl = document.getElementById('server-panel-workers') as HTMLElement;
const serverPanelEnvCheckEl = document.getElementById('server-panel-env-check') as HTMLElement;
const serverEnvCheckRefreshBtn = document.getElementById('server-env-check-refresh') as HTMLButtonElement;
const serverEnvCheckMetaEl = document.getElementById('server-env-check-meta') as HTMLDivElement;
const serverEnvCheckContentEl = document.getElementById('server-env-check-content') as HTMLDivElement;
const serverSubtabFlagsBtn = document.getElementById('server-subtab-flags') as HTMLButtonElement | null;
const serverPanelFlagsEl = document.getElementById('server-panel-flags') as HTMLElement | null;
const serverSubtabObjectsBtn = document.getElementById('server-subtab-objects') as HTMLButtonElement;
const serverPanelObjectsEl = document.getElementById('server-panel-objects') as HTMLElement;
const serverObjectsRefreshBtn = document.getElementById('server-objects-refresh') as HTMLButtonElement;
const serverObjectsMetaEl = document.getElementById('server-objects-meta') as HTMLDivElement;
const serverObjectsContentEl = document.getElementById('server-objects-content') as HTMLDivElement;
const serverFlagsRefreshBtn = document.getElementById('server-flags-refresh') as HTMLButtonElement | null;
const serverFlagsMetaEl = document.getElementById('server-flags-meta') as HTMLDivElement | null;
const serverFlagsContentEl = document.getElementById('server-flags-content') as HTMLDivElement | null;
const serverFlagsNewKeyInput = document.getElementById('server-flags-new-key') as HTMLInputElement | null;
const serverFlagsAddBtn = document.getElementById('server-flags-add') as HTMLButtonElement | null;
/** serverWorkersRefreshBtn：服务端Workers刷新Btn。 */
const serverWorkersRefreshBtn = document.getElementById('server-workers-refresh') as HTMLButtonElement;
/** serverWorkersMetaEl：服务端Workers元信息El。 */
const serverWorkersMetaEl = document.getElementById('server-workers-meta') as HTMLDivElement;
/** serverWorkersContentEl：服务端Workers内容El。 */
const serverWorkersContentEl = document.getElementById('server-workers-content') as HTMLDivElement;
/** serverLogsLoadOlderBtn：服务端日志加载更早Btn。 */
const serverLogsLoadOlderBtn = document.getElementById('server-logs-load-older') as HTMLButtonElement;
/** serverLogsRefreshBtn：服务端日志刷新Btn。 */
const serverLogsRefreshBtn = document.getElementById('server-logs-refresh') as HTMLButtonElement;
/** serverLogsMetaEl：服务端日志元信息El。 */
const serverLogsMetaEl = document.getElementById('server-logs-meta') as HTMLDivElement;
/** serverLogsContentEl：服务端日志内容El。 */
const serverLogsContentEl = document.getElementById('server-logs-content') as HTMLPreElement;
function getDiagCommandEl(): HTMLTextAreaElement | null { return document.getElementById('server-diagnostics-command') as HTMLTextAreaElement | null; }
function getDiagLimitEl(): HTMLInputElement | null { return document.getElementById('server-diagnostics-limit') as HTMLInputElement | null; }
function getDiagRunBtn(): HTMLButtonElement | null { return document.getElementById('server-diagnostics-run') as HTMLButtonElement | null; }
function getDiagHelpBtn(): HTMLButtonElement | null { return document.getElementById('server-diagnostics-help') as HTMLButtonElement | null; }
function getDiagMetaEl(): HTMLDivElement | null { return document.getElementById('server-diagnostics-meta') as HTMLDivElement | null; }
function getDiagOutputEl(): HTMLDivElement | null { return document.getElementById('server-diagnostics-output') as HTMLDivElement | null; }
function getDiagUndoBtn(): HTMLButtonElement | null { return document.getElementById('server-diagnostics-undo') as HTMLButtonElement | null; }
function getDiagShortcutsEl(): HTMLDivElement | null { return document.getElementById('diagnostics-shortcuts') as HTMLDivElement | null; }
/** trafficResetMetaEl：traffic Reset元数据El。 */
const trafficResetMetaEl = document.getElementById('traffic-reset-meta') as HTMLDivElement;
/** trafficTotalInEl：traffic总量In El。 */
const trafficTotalInEl = document.getElementById('traffic-total-in') as HTMLDivElement;
/** trafficTotalInNoteEl：traffic总量In Note El。 */
const trafficTotalInNoteEl = document.getElementById('traffic-total-in-note') as HTMLDivElement;
/** trafficTotalOutEl：traffic总量Out El。 */
const trafficTotalOutEl = document.getElementById('traffic-total-out') as HTMLDivElement;
/** trafficTotalOutNoteEl：traffic总量Out Note El。 */
const trafficTotalOutNoteEl = document.getElementById('traffic-total-out-note') as HTMLDivElement;
/** resetNetworkStatsBtn：reset Network属性Btn。 */
const resetNetworkStatsBtn = document.getElementById('reset-network-stats') as HTMLButtonElement;
const toggleNetworkPayloadCaptureBtn = document.getElementById('toggle-network-payload-capture') as HTMLButtonElement;
/** resetCpuStatsBtn：reset Cpu属性Btn。 */
const resetCpuStatsBtn = document.getElementById('reset-cpu-stats') as HTMLButtonElement;
/** resetPathfindingStatsBtn：reset Pathfinding属性Btn。 */
const resetPathfindingStatsBtn = document.getElementById('reset-pathfinding-stats') as HTMLButtonElement;
/** triggerManualGcBtn：手动触发 V8 GC 诊断按钮。 */
const triggerManualGcBtn = document.getElementById('trigger-manual-gc') as HTMLButtonElement;
/** writeHeapSnapshotBtn：生成Heap Snapshot按钮。 */
const writeHeapSnapshotBtn = document.getElementById('write-heap-snapshot') as HTMLButtonElement;
/** copyHeapSnapshotSummaryBtn：生成 Heap Snapshot 后自动复制摘要 JSON 到剪贴板的按钮。 */
const copyHeapSnapshotSummaryBtn = document.getElementById('copy-heap-snapshot-summary') as HTMLButtonElement | null;
/** copyLatestHeapSnapshotSummaryBtn：复制最近一次 Heap Snapshot 摘要 JSON 到剪贴板的按钮。 */
const copyLatestHeapSnapshotSummaryBtn = document.getElementById('copy-latest-heap-snapshot-summary') as HTMLButtonElement | null;
/** heapSnapshotMetaEl：Heap Snapshot操作状态。 */
const heapSnapshotMetaEl = document.getElementById('heap-snapshot-meta') as HTMLDivElement;
/** cpuCurrentPercentEl：cpu当前Percent El。 */
const cpuCurrentPercentEl = document.getElementById('cpu-current-percent') as HTMLDivElement;
/** cpuTickWindowPercentEl：cpu Tick窗口Percent El。 */
const cpuTickWindowPercentEl = document.getElementById('cpu-tick-window-percent') as HTMLDivElement;
/** cpuTickWindowNoteEl：cpu Tick窗口Note El。 */
const cpuTickWindowNoteEl = document.getElementById('cpu-tick-window-note') as HTMLDivElement;
/** cpuMainThreadPercentEl：主线程事件循环占用。 */
const cpuMainThreadPercentEl = document.getElementById('cpu-main-thread-percent') as HTMLDivElement;
/** cpuMainThreadNoteEl：主线程事件循环说明。 */
const cpuMainThreadNoteEl = document.getElementById('cpu-main-thread-note') as HTMLDivElement;
/** cpuWorkerThreadMsEl：Worker窗口耗时。 */
const cpuWorkerThreadMsEl = document.getElementById('cpu-worker-thread-ms') as HTMLDivElement;
/** cpuWorkerThreadNoteEl：Worker窗口耗时说明。 */
const cpuWorkerThreadNoteEl = document.getElementById('cpu-worker-thread-note') as HTMLDivElement;
/** cpuProfileMetaEl：cpu Profile元数据El。 */
const cpuProfileMetaEl = document.getElementById('cpu-profile-meta') as HTMLDivElement;
/** cpuCoreCountEl：cpu Core数量El。 */
const cpuCoreCountEl = document.getElementById('cpu-core-count') as HTMLDivElement;
/** cpuUserMsEl：cpu用户Ms El。 */
const cpuUserMsEl = document.getElementById('cpu-user-ms') as HTMLDivElement;
/** cpuSystemMsEl：cpu系统Ms El。 */
const cpuSystemMsEl = document.getElementById('cpu-system-ms') as HTMLDivElement;
/** cpuLoad1mEl：cpu Load1m El。 */
const cpuLoad1mEl = document.getElementById('cpu-load-1m') as HTMLDivElement;
/** cpuLoad5mEl：cpu Load5m El。 */
const cpuLoad5mEl = document.getElementById('cpu-load-5m') as HTMLDivElement;
/** cpuLoad15mEl：cpu Load15m El。 */
const cpuLoad15mEl = document.getElementById('cpu-load-15m') as HTMLDivElement;
/** cpuProcessUptimeEl：cpu Process Uptime El。 */
const cpuProcessUptimeEl = document.getElementById('cpu-process-uptime') as HTMLDivElement;
/** cpuSystemUptimeEl：cpu系统Uptime El。 */
const cpuSystemUptimeEl = document.getElementById('cpu-system-uptime') as HTMLDivElement;
/** memorySnapshotMetaEl：内存快照说明。 */
const memorySnapshotMetaEl = document.getElementById('memory-snapshot-meta') as HTMLDivElement;
/** memoryRssEl：memory Rss El。 */
const memoryRssEl = document.getElementById('memory-rss') as HTMLDivElement;
/** memoryHeapUsedEl：memory Heap Used El。 */
const memoryHeapUsedEl = document.getElementById('memory-heap-used') as HTMLDivElement;
/** memoryHeapTotalEl：memory Heap总量El。 */
const memoryHeapTotalEl = document.getElementById('memory-heap-total') as HTMLDivElement;
/** memoryExternalEl：memory External El。 */
const memoryExternalEl = document.getElementById('memory-external') as HTMLDivElement;
/** memoryHeapUsagePercentEl：memory Heap使用率El。 */
const memoryHeapUsagePercentEl = document.getElementById('memory-heap-usage-percent') as HTMLDivElement;
/** memoryHeapUsageNoteEl：memory Heap使用率说明。 */
const memoryHeapUsageNoteEl = document.getElementById('memory-heap-usage-note') as HTMLDivElement;
/** memoryHeapFreeEl：memory Heap空闲El。 */
const memoryHeapFreeEl = document.getElementById('memory-heap-free') as HTMLDivElement;
/** memoryResidentGapEl：memory 常驻差额El。 */
const memoryResidentGapEl = document.getElementById('memory-resident-gap') as HTMLDivElement;
/** memoryRssHeapRatioEl：memory Rss/Heap 比值El。 */
const memoryRssHeapRatioEl = document.getElementById('memory-rss-heap-ratio') as HTMLDivElement;
/** memoryRssHeapRatioNoteEl：memory Rss/Heap 比值说明。 */
const memoryRssHeapRatioNoteEl = document.getElementById('memory-rss-heap-ratio-note') as HTMLDivElement;
/** memoryEstimateMetaEl：内存估算说明。 */
const memoryEstimateMetaEl = document.getElementById('memory-estimate-meta') as HTMLDivElement;
/** memoryDomainListEl：内存域画像列表。 */
const memoryDomainListEl = document.getElementById('memory-domain-list') as HTMLDivElement;
/** memoryHeapSpaceListEl：V8 heap space列表。 */
const memoryHeapSpaceListEl = document.getElementById('memory-heap-space-list') as HTMLDivElement;
/** memoryInstanceListEl：实例内存画像列表。 */
const memoryInstanceListEl = document.getElementById('memory-instance-list') as HTMLDivElement;
/** pathfindingResetMetaEl：pathfinding Reset元数据El。 */
const pathfindingResetMetaEl = document.getElementById('pathfinding-reset-meta') as HTMLDivElement;
/** pathfindingAvgQueueMsEl：pathfinding Avg队列Ms El。 */
const pathfindingAvgQueueMsEl = document.getElementById('pathfinding-avg-queue-ms') as HTMLDivElement;
/** pathfindingQueueNoteEl：pathfinding队列Note El。 */
const pathfindingQueueNoteEl = document.getElementById('pathfinding-queue-note') as HTMLDivElement;
/** pathfindingAvgRunMsEl：pathfinding Avg Run Ms El。 */
const pathfindingAvgRunMsEl = document.getElementById('pathfinding-avg-run-ms') as HTMLDivElement;
/** pathfindingRunNoteEl：pathfinding Run Note El。 */
const pathfindingRunNoteEl = document.getElementById('pathfinding-run-note') as HTMLDivElement;
/** pathfindingAvgExpandedNodesEl：pathfinding Avg Expanded Nodes El。 */
const pathfindingAvgExpandedNodesEl = document.getElementById('pathfinding-avg-expanded-nodes') as HTMLDivElement;
/** pathfindingExpandedNoteEl：pathfinding Expanded Note El。 */
const pathfindingExpandedNoteEl = document.getElementById('pathfinding-expanded-note') as HTMLDivElement;
/** pathfindingDropTotalEl：pathfinding掉落总量El。 */
const pathfindingDropTotalEl = document.getElementById('pathfinding-drop-total') as HTMLDivElement;
/** pathfindingDropNoteEl：pathfinding掉落Note El。 */
const pathfindingDropNoteEl = document.getElementById('pathfinding-drop-note') as HTMLDivElement;
/** pathfindingFailureListEl：pathfinding Failure列表El。 */
const pathfindingFailureListEl = document.getElementById('pathfinding-failure-list') as HTMLDivElement;
/** cpuBreakdownListEl：cpu Breakdown列表El。 */
const cpuBreakdownListEl = document.getElementById('cpu-breakdown-list') as HTMLDivElement;
/** gmPasswordForm：GM密码Form。 */
const gmPasswordForm = document.getElementById('gm-password-form') as HTMLFormElement;
/** gmPasswordCurrentInput：GM密码当前输入。 */
const gmPasswordCurrentInput = document.getElementById('gm-password-current') as HTMLInputElement;
/** gmPasswordNextInput：GM密码新版输入。 */
const gmPasswordNextInput = document.getElementById('gm-password-next') as HTMLInputElement;
/** gmPasswordSaveBtn：GM密码保存Btn。 */
const gmPasswordSaveBtn = document.getElementById('gm-password-save') as HTMLButtonElement;
/** playerWorkspaceEl：玩家Workspace El。 */
const playerWorkspaceEl = document.getElementById('player-workspace') as HTMLElement;
/** redeemWorkspaceEl：兑换Workspace El。 */
const redeemWorkspaceEl = document.getElementById('redeem-workspace') as HTMLElement;
/** serverWorkspaceEl：服务端Workspace El。 */
const serverWorkspaceEl = document.getElementById('server-workspace') as HTMLElement;
/** worldWorkspaceEl：世界Workspace El。 */
const worldWorkspaceEl = document.getElementById('world-workspace') as HTMLElement;
/** shortcutWorkspaceEl：shortcut Workspace El。 */
const shortcutWorkspaceEl = document.getElementById('shortcut-workspace') as HTMLElement;
/** envWorkspaceEl：密钥管理 workspace El。 */
const envWorkspaceEl = document.getElementById('secrets-workspace') as HTMLElement;
/** gameConfigWorkspaceEl：游戏配置 workspace El。 */
const gameConfigWorkspaceEl = document.getElementById('gameconfig-workspace') as HTMLElement;
/** aiWorkspaceEl：AI 配置 workspace El。 */
const aiWorkspaceEl = document.getElementById('ai-workspace') as HTMLElement;
/** generatedTechniqueWorkspaceEl：AI 生成功法 workspace El。 */
const generatedTechniqueWorkspaceEl = document.getElementById('generated-technique-workspace') as HTMLElement;
/** tradesWorkspaceEl：交易记录 workspace El。 */
const tradesWorkspaceEl = document.getElementById('trades-workspace') as HTMLElement;
/** shortcutMailComposerEl：shortcut邮件Composer El。 */
const shortcutMailComposerEl = document.getElementById('shortcut-mail-composer') as HTMLDivElement | null;
/** serverTabBtn：服务端Tab Btn。 */
const serverTabBtn = document.getElementById('gm-tab-server') as HTMLButtonElement;
/** redeemTabBtn：兑换Tab Btn。 */
const redeemTabBtn = document.getElementById('gm-tab-redeem') as HTMLButtonElement;
/** playerTabBtn：玩家Tab Btn。 */
const playerTabBtn = document.getElementById('gm-tab-players') as HTMLButtonElement;
/** worldTabBtn：世界Tab Btn。 */
const worldTabBtn = document.getElementById('gm-tab-world') as HTMLButtonElement;
/** shortcutTabBtn：shortcut Tab Btn。 */
const shortcutTabBtn = document.getElementById('gm-tab-shortcuts') as HTMLButtonElement;
/** envTabBtn：密钥管理 Tab Btn。 */
const envTabBtn = document.getElementById('gm-tab-secrets') as HTMLButtonElement;
/** gameConfigTabBtn：游戏配置 Tab Btn。 */
const gameConfigTabBtn = document.getElementById('gm-tab-gameconfig') as HTMLButtonElement;
/** aiTabBtn：AI 配置 Tab Btn。 */
const aiTabBtn = document.getElementById('gm-tab-ai') as HTMLButtonElement;
/** generatedTechniqueTabBtn：AI 功法 Tab Btn。 */
const generatedTechniqueTabBtn = document.getElementById('gm-tab-generated-techniques') as HTMLButtonElement;
/** generatedTechniqueSubtabTechniquesBtn：AI 生成功法子标签。 */
const generatedTechniqueSubtabTechniquesBtn = document.getElementById('generated-technique-subtab-techniques') as HTMLButtonElement;
/** generatedTechniqueSubtabJobsBtn：AI 生成任务子标签。 */
const generatedTechniqueSubtabJobsBtn = document.getElementById('generated-technique-subtab-jobs') as HTMLButtonElement;
/** generatedTechniqueSubtabManualBtn：手工功法子标签。 */
const generatedTechniqueSubtabManualBtn = document.getElementById('generated-technique-subtab-manual') as HTMLButtonElement;
/** generatedTechniqueBrowseEl：已发布功法浏览区域。 */
const generatedTechniqueBrowseEl = document.getElementById('generated-technique-browse') as HTMLElement;
/** generatedTechniquePaginationEl：已发布功法分页区域。 */
const generatedTechniquePaginationEl = document.getElementById('generated-technique-pagination') as HTMLElement;
/** customTechniqueFormEl：手工功法表单。 */
const customTechniqueFormEl = document.getElementById('custom-technique-form') as HTMLFormElement;
/** customTechniqueInternalFieldsEl：内功字段区域。 */
const customTechniqueInternalFieldsEl = document.getElementById('custom-technique-internal-fields') as HTMLElement;
/** customTechniqueArtsFieldsEl：术法字段区域。 */
const customTechniqueArtsFieldsEl = document.getElementById('custom-technique-arts-fields') as HTMLElement;
/** customTechniqueBudgetOutputEl：强度倍率输出。 */
const customTechniqueBudgetOutputEl = document.getElementById('custom-technique-budget-output') as HTMLOutputElement;
/** tradesTabBtn：交易记录 Tab Btn。 */
const tradesTabBtn = document.getElementById('gm-tab-trades') as HTMLButtonElement;
/** generatedTechniqueListEl：AI 生成功法列表容器。 */
const generatedTechniqueListEl = document.getElementById('generated-technique-list') as HTMLElement;
/** generatedTechniqueRefreshBtn：AI 生成功法刷新按钮。 */
const generatedTechniqueRefreshBtn = document.getElementById('generated-technique-refresh') as HTMLButtonElement;
/** generatedTechniquePageMetaEl：AI 生成功法分页元信息。 */
const generatedTechniquePageMetaEl = document.getElementById('generated-technique-page-meta') as HTMLElement;
/** generatedTechniquePagePrevBtn：AI 生成功法上一页。 */
const generatedTechniquePagePrevBtn = document.getElementById('generated-technique-page-prev') as HTMLButtonElement;
/** generatedTechniquePageNextBtn：AI 生成功法下一页。 */
const generatedTechniquePageNextBtn = document.getElementById('generated-technique-page-next') as HTMLButtonElement;
/** generatedTechniqueDetailEmptyEl：AI 生成功法详情空态。 */
const generatedTechniqueDetailEmptyEl = document.getElementById('generated-technique-detail-empty') as HTMLElement;
/** generatedTechniqueDetailEl：AI 生成功法详情容器。 */
const generatedTechniqueDetailEl = document.getElementById('generated-technique-detail') as HTMLElement;
/** generatedTechniqueDetailMetaEl：AI 生成功法详情元信息。 */
const generatedTechniqueDetailMetaEl = document.getElementById('generated-technique-detail-meta') as HTMLElement;
/** generatedTechniqueJsonEl：AI 生成功法原始 JSON。 */
const generatedTechniqueJsonEl = document.getElementById('generated-technique-json') as HTMLTextAreaElement;
/** tradesFormEl：交易记录搜索表单。 */
const tradesFormEl = document.getElementById('gm-trades-form') as HTMLFormElement;
/** tradesPlayerInput：玩家序号 / playerId 输入。 */
const tradesPlayerInput = document.getElementById('gm-trades-player') as HTMLInputElement;
/** tradesItemInput：物品名输入。 */
const tradesItemInput = document.getElementById('gm-trades-item') as HTMLInputElement;
/** tradesPageSizeInput：每页条数输入。 */
const tradesPageSizeInput = document.getElementById('gm-trades-page-size') as HTMLInputElement;
/** tradesResetBtn：清空条件按钮。 */
const tradesResetBtn = document.getElementById('gm-trades-reset') as HTMLButtonElement;
/** tradesMetaEl：当前查询元信息。 */
const tradesMetaEl = document.getElementById('gm-trades-meta') as HTMLElement;
/** tradesListEl：交易记录列表容器。 */
const tradesListEl = document.getElementById('gm-trades-list') as HTMLElement;
/** tradesPageMetaEl：分页元信息。 */
const tradesPageMetaEl = document.getElementById('gm-trades-page-meta') as HTMLElement;
/** tradesPagePrevBtn：上一页。 */
const tradesPagePrevBtn = document.getElementById('gm-trades-page-prev') as HTMLButtonElement;
/** tradesPageNextBtn：下一页。 */
const tradesPageNextBtn = document.getElementById('gm-trades-page-next') as HTMLButtonElement;
/** redeemStatusEl：兑换状态El。 */
const redeemStatusEl = document.getElementById('redeem-status') as HTMLDivElement | null;
/** redeemGroupListEl：兑换分组列表El。 */
const redeemGroupListEl = document.getElementById('redeem-group-list') as HTMLDivElement | null;
/** redeemGroupEditorEl：兑换分组编辑器El。 */
const redeemGroupEditorEl = document.getElementById('redeem-group-editor') as HTMLDivElement | null;
/** redeemCodeListEl：兑换兑换码列表El。 */
const redeemCodeListEl = document.getElementById('redeem-code-list') as HTMLDivElement | null;

/** GmEditorTab：GM 玩家编辑器顶部标签页 ID。 */
type GmEditorTab = EditorGmEditorTab;

/** GmServerTab：服务器监察子标签页 ID。 */
type GmServerTab = 'overview' | 'traffic' | 'cpu' | 'memory' | 'database' | 'logs' | 'workers' | 'envCheck' | 'objects';

/** GmMailAttachmentDraft：邮件草稿里的单个附件条目。 */
type GmMailAttachmentDraft = MailComposerGmMailAttachmentDraft;

/** GmMailComposerDraft：GM 发信草稿上下文，保存收件人、标题、正文与附件。 */
type GmMailComposerDraft = MailComposerGmMailComposerDraft;

/** RedeemGroupDraft：兑换码分组编辑草稿，保存名称、奖励和批量数量。 */
type RedeemGroupDraft = RedeemPanelRedeemGroupDraft;
/** SearchableItemScope：分类枚举。 */
type SearchableItemScope = 'all' | 'inventory-add' | 'equipment-slot' | 'artifact-slot';

/** MAIL_ATTACHMENT_ITEM_PAGE_SIZE：邮件ATTACHMENT物品分页SIZE。 */
const MAIL_ATTACHMENT_ITEM_PAGE_SIZE = 10;
/** SEARCHABLE_ITEM_RESULT_LIMIT：SEARCHABLE物品结果LIMIT。 */
const SEARCHABLE_ITEM_RESULT_LIMIT = 80;
/** SERVER_LOG_PAGE_SIZE：服务端日志默认读取行数。 */
const SERVER_LOG_PAGE_SIZE = 100;

startClientVersionReload({
  onBeforeReload: () => {
    setStatus(t('gm.client.version.reload'));
  },
});

/** token：令牌。 */
let token = sessionStorage.getItem(GM_ACCESS_TOKEN_STORAGE_KEY) ?? '';
/** state：状态。 */
let state: GmStateRes | null = null;
/** databaseState：数据库状态。 */
let databaseState: GmDatabaseStateRes | null = null;
/** databaseImportBusy：数据库导入上传中。 */
let databaseImportBusy = false;
/** databaseImportStatus：数据库导入局部状态。 */
let databaseImportStatus = '';
/** selectedDatabaseImportFile：当前已选择但尚未上传的数据库备份文件。 */
let selectedDatabaseImportFile: File | null = null;
/** persistentFileInput：持久化的文件选择 input 节点，避免被 innerHTML 销毁导致 change 事件丢失。 */
const persistentFileInput = document.createElement('input');
persistentFileInput.id = 'database-import-file';
persistentFileInput.className = 'search-input';
persistentFileInput.type = 'file';
persistentFileInput.accept = '.dump,.gz,application/octet-stream,application/gzip';
persistentFileInput.addEventListener('change', () => {
  updateDatabaseImportFileSelection(persistentFileInput.files?.[0] ?? null);
});
type DatabaseSubTab = 'commands' | 'backup' | 'table-stats';
let databaseSubTab: DatabaseSubTab = 'commands';
let tableStatsState: GmDatabaseTableStatsRes | null = null;
let tableStatsLoading = false;
let cleanupBusy = false;
/** EditorCatalogSource：编辑器目录数据的当前来源标记。 */
type EditorCatalogSource = 'server' | 'local-fallback' | 'unavailable';
/** editorCatalog：编辑器目录。 */
let editorCatalog: GmEditorCatalogRes | null = null;
/** editorCatalogSource：编辑器目录来源。 */
let editorCatalogSource: EditorCatalogSource = 'unavailable';
/** selectedPlayerId：selected玩家ID。 */
let selectedPlayerId: string | null = null;
/** selectedPlayerDetail：selected玩家详情。 */
let selectedPlayerDetail: GmManagedPlayerRecord | null = null;
/** selectedPlayerDetailError：selected玩家详情错误。 */
let selectedPlayerDetailError: string | null = null;
/** loadingPlayerDetailId：loading玩家详情ID。 */
let loadingPlayerDetailId: string | null = null;
/** detailRequestNonce：详情请求Nonce。 */
let detailRequestNonce = 0;
let playerListRequestNonce = 0;
/** draftSnapshot：draft快照。 */
let draftSnapshot: PlayerState | null = null;
/** editorDirty：编辑器Dirty。 */
let editorDirty = false;
/** draftSourcePlayerId：draft来源玩家ID。 */
let draftSourcePlayerId: string | null = null;
/** pollTimer：poll Timer。 */
let pollTimer: number | null = null;
/** currentTab：当前Tab。 */
type GmMainTab = 'server' | 'redeem' | 'players' | 'world' | 'shortcuts' | 'secrets' | 'gameconfig' | 'ai' | 'generatedTechniques' | 'trades';
let currentTab: GmMainTab = 'server';
/** currentServerTab：当前服务端Tab。 */
let currentServerTab: GmServerTab = 'overview';
/** currentCpuBreakdownSort：当前Cpu Breakdown排序。 */
let currentCpuBreakdownSort: CpuBreakdownSortMode = 'totalMs';
/** currentCpuBreakdownSortDirection：当前Cpu Breakdown排序方向。 */
let currentCpuBreakdownSortDirection: MetricTreeSortDirection = 'desc';
/** collapsedCpuBreakdownGroupKeys：已折叠的Cpu Breakdown分组。 */
const collapsedCpuBreakdownGroupKeys = new Set<string>();
/** currentEditorTab：当前编辑器Tab。 */
let currentEditorTab: GmEditorTab = 'basic';
/** currentDatabaseTable：当前数据库表标签。 */
let currentDatabaseTable = 'server_player_snapshot';
let currentInventoryAddType: (typeof ITEM_TYPES)[number] = 'material';
let currentInventorySearchQuery = '';
type GmTechniqueEditorSubtab = TechniqueManagerGmTechniqueEditorSubtab;
type GmTechniqueCandidateSource = TechniqueManagerGmTechniqueCandidateSource;
type GmTechniqueCategoryFilter = TechniqueManagerGmTechniqueCategoryFilter;
type GmTechniqueGradeFilter = TechniqueManagerGmTechniqueGradeFilter;
type GmTechniqueCandidate = TechniqueManagerGmTechniqueCandidate;
const GM_TECHNIQUE_CATEGORY_FILTER_OPTIONS = techniqueManagerCategoryFilterOptions;
const GM_TECHNIQUE_GRADE_FILTER_OPTIONS = techniqueManagerGradeFilterOptions;
let currentTechniqueEditorSubtab: GmTechniqueEditorSubtab = 'overview';
let currentTechniqueCandidateSource: GmTechniqueCandidateSource = 'system';
let currentTechniqueCategoryFilter: GmTechniqueCategoryFilter = 'all';
let currentTechniqueGradeFilter: GmTechniqueGradeFilter = 'all';
let currentTechniqueRealmLvFilter = '';
let currentTechniqueSearchQuery = '';
let currentTechniqueCandidatePage = 1;
let currentTechniqueLearnedPage = 1;
let currentTechniquePageSize = 20;
let currentTechniqueRandomPickCount = 5;
let generatedTechniqueCandidatePageTotal = 1;
let generatedTechniqueCandidateTotal = 0;
let generatedTechniqueCandidateLoading = false;
let generatedTechniqueCandidateError = '';
let generatedTechniqueCandidates: GmGeneratedTechniqueSummary[] = [];
let generatedTechniqueCandidateRequestNonce = 0;
let techniqueCandidateSearchTimer: number | null = null;
const selectedTechniqueCandidateIds = new Set<string>();
const selectedGeneratedTechniqueCandidateById = new Map<string, GmGeneratedTechniqueSummary>();
const selectedLearnedTechniqueIds = new Set<string>();
/** currentPlayerSort：当前玩家排序。 */
let currentPlayerSort: GmPlayerSortMode = (playerSortSelect.value as GmPlayerSortMode) || 'realm-desc';
/** currentPlayerAccountStatusFilter：当前玩家账号状态筛选。 */
let currentPlayerAccountStatusFilter: GmPlayerAccountStatusFilter = (playerAccountStatusFilterSelect.value as GmPlayerAccountStatusFilter) || 'all';
/** currentPlayerPage：当前玩家分页。 */
let currentPlayerPage = 1;
/** currentPlayerTotalPages：当前玩家总量Pages。 */
let currentPlayerTotalPages = 1;
/** playerSearchTimer：玩家搜索Timer。 */
let playerSearchTimer: number | null = null;
/** statusToastTimer：状态Toast Timer。 */
let statusToastTimer: number | null = null;
/** currentGeneratedTechniqueSubtab：AI生成当前子标签。 */
let currentGeneratedTechniqueSubtab: 'techniques' | 'jobs' | 'manual' = 'techniques';
/** generatedTechniquePage：AI 生成功法当前分页。 */
let generatedTechniquePage = 1;
/** generatedTechniqueTotalPages：AI 生成功法总页数。 */
let generatedTechniqueTotalPages = 1;
/** generatedTechniques：AI 生成功法当前页摘要。 */
let generatedTechniques: GmGeneratedTechniqueSummary[] = [];
/** techniqueGenerationJobPage：AI 生成任务当前分页。 */
let techniqueGenerationJobPage = 1;
/** techniqueGenerationJobTotalPages：AI 生成任务总页数。 */
let techniqueGenerationJobTotalPages = 1;
/** techniqueGenerationJobs：AI 生成任务当前页摘要。 */
let techniqueGenerationJobs: GmTechniqueGenerationJobSummary[] = [];
/** selectedGeneratedTechniqueId：当前选中的 AI 生成功法 ID。 */
let selectedGeneratedTechniqueId: string | null = null;
/** selectedGeneratedTechniqueDetail：当前选中的 AI 生成功法详情。 */
let selectedGeneratedTechniqueDetail: GmGeneratedTechniqueDetailRes['technique'] | null = null;
/** selectedTechniqueGenerationJobId：当前选中的 AI 生成任务 ID。 */
let selectedTechniqueGenerationJobId: string | null = null;
/** selectedTechniqueGenerationJobDetail：当前选中的 AI 生成任务详情。 */
let selectedTechniqueGenerationJobDetail: GmTechniqueGenerationJobDetailRes['job'] | null = null;
/** generatedTechniqueListRequestNonce：AI 生成功法列表请求 nonce。 */
let generatedTechniqueListRequestNonce = 0;
/** generatedTechniqueDetailRequestNonce：AI 生成功法详情请求 nonce。 */
let generatedTechniqueDetailRequestNonce = 0;
/** techniqueGenerationJobListRequestNonce：AI 生成任务列表请求 nonce。 */
let techniqueGenerationJobListRequestNonce = 0;
/** techniqueGenerationJobDetailRequestNonce：AI 生成任务详情请求 nonce。 */
let techniqueGenerationJobDetailRequestNonce = 0;
let generatedTechniqueEditor: GmCustomTechniqueEditor;
const networkLargePayloadBucketByKey = new Map<string, GmNetworkBucket>();
/** currentTrafficBreakdownSort：当前流量分项排序。 */
let currentTrafficBreakdownSort: TrafficBreakdownSortMode = 'bytes';
/** currentTrafficBreakdownSortDirection：当前流量分项排序方向。 */
let currentTrafficBreakdownSortDirection: MetricTreeSortDirection = 'desc';
/** collapsedTrafficBreakdownGroupKeys：已折叠的流量分组。 */
const collapsedTrafficBreakdownGroupKeys = new Set<string>();
type GmPositionMapCategory = MapGmPositionMapCategory;
const GM_POSITION_MAP_CATEGORY_OPTIONS = mapGmPositionMapCategoryOptions;
let gmMapSummaries: GmMapSummary[] = [];
let gmWorldInstances: GmWorldInstanceSummary[] = [];
let gmMapPickerCatalogLoaded = false;
let gmMapPickerCatalogLoading: Promise<void> | null = null;
let gmMapPickerCatalogWarned = false;
let positionMapCategoryDraft: { playerId: string; category: GmPositionMapCategory } | null = null;
/** lastPlayerListStructureKey：last玩家列表Structure Key。 */
let lastPlayerListStructureKey: string | null = null;
/** lastEditorStructureKey：last编辑器Structure Key。 */
let lastEditorStructureKey: string | null = null;

function buildGmStateApiPath(params: URLSearchParams): string {
  return apiBuildGmStateApiPath(params);
}

function buildGmPlayersApiPath(params: URLSearchParams): string {
  return apiBuildGmPlayersApiPath(params);
}

function buildGmPlayerApiPath(playerId: string): string {
  return apiBuildGmPlayerApiPath(playerId);
}

function buildGmGeneratedTechniquesApiPath(params: URLSearchParams): string {
  return apiBuildGmGeneratedTechniquesApiPath(params);
}

function buildGmGeneratedTechniqueDetailApiPath(id: string): string {
  return apiBuildGmGeneratedTechniqueDetailApiPath(id);
}

function buildGmTechniqueGenerationJobsApiPath(params: URLSearchParams): string {
  return apiBuildGmTechniqueGenerationJobsApiPath(params);
}

function buildGmTechniqueGenerationJobDetailApiPath(id: string): string {
  return apiBuildGmTechniqueGenerationJobDetailApiPath(id);
}

function buildTechniqueCandidateGeneratedQueryParams(): URLSearchParams {
  const params = new URLSearchParams({
    page: String(currentTechniqueCandidatePage),
    pageSize: String(currentTechniquePageSize),
    publishedOnly: 'true',
  });
  const keyword = currentTechniqueSearchQuery.trim();
  if (keyword) {
    params.set('keyword', keyword);
  }
  if (currentTechniqueCategoryFilter !== 'all') {
    params.set('category', currentTechniqueCategoryFilter);
  }
  if (currentTechniqueGradeFilter !== 'all') {
    params.set('grade', currentTechniqueGradeFilter);
  }
  const realmLv = getTechniqueRealmLvFilterValue();
  if (realmLv !== null) {
    params.set('realmLv', String(realmLv));
  }
  return params;
}

function patchTechniqueManagerListsFromDraft(): void {
  if (!draftSnapshot) {
    return;
  }
  const candidateListEl = editorContentEl.querySelector<HTMLElement>('[data-gm-technique-candidate-list]');
  if (candidateListEl) {
    candidateListEl.innerHTML = renderTechniqueCandidateList(ensureArray(draftSnapshot.techniques));
  }
  const learnedListEl = editorContentEl.querySelector<HTMLElement>('[data-gm-technique-learned-list]');
  if (learnedListEl) {
    learnedListEl.innerHTML = renderLearnedTechniqueList(ensureArray(draftSnapshot.techniques));
  }
}

function patchTechniqueManagerBodyFromDraft(): void {
  if (!draftSnapshot) {
    return;
  }
  const bodyEl = editorContentEl.querySelector<HTMLElement>('[data-gm-technique-body]');
  if (!bodyEl) {
    rerenderTechniqueEditor();
    return;
  }
  const techniques = ensureArray(draftSnapshot.techniques);
  const autoBattleSkills = ensureArray(draftSnapshot.autoBattleSkills);
  bodyEl.innerHTML = currentTechniqueEditorSubtab === 'overview'
    ? renderTechniqueOverview(techniques, autoBattleSkills, draftSnapshot.cultivatingTechId)
    : currentTechniqueEditorSubtab === 'manage'
      ? renderTechniqueManage(techniques)
      : renderTechniqueDetails(techniques);
  editorContentEl.querySelectorAll<HTMLElement>('[data-technique-subtab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.techniqueSubtab === currentTechniqueEditorSubtab);
  });
}

async function loadGeneratedTechniqueCandidates(silent = true): Promise<void> {
  if (!token) {
    return;
  }
  const nonce = ++generatedTechniqueCandidateRequestNonce;
  generatedTechniqueCandidateLoading = true;
  generatedTechniqueCandidateError = '';
  patchTechniqueManagerListsFromDraft();
  try {
    const result = await request<GmGeneratedTechniqueListRes>(
      buildGmGeneratedTechniquesApiPath(buildTechniqueCandidateGeneratedQueryParams()),
    );
    if (nonce !== generatedTechniqueCandidateRequestNonce) {
      return;
    }
    const disabledTechniqueIds = new Set(result.techniques
      .filter((entry) => typeof entry.playerAddDisabledReason === 'string' && entry.playerAddDisabledReason.trim().length > 0)
      .map((entry) => entry.id));
    for (const techId of disabledTechniqueIds) {
      selectedTechniqueCandidateIds.delete(techId);
      selectedGeneratedTechniqueCandidateById.delete(techId);
    }

    generatedTechniqueCandidates = result.techniques;
    currentTechniqueCandidatePage = result.page.page;
    generatedTechniqueCandidatePageTotal = Math.max(1, result.page.totalPages);
    generatedTechniqueCandidateTotal = result.page.total;
    if (!silent) {
      setStatus(`已加载玩家自创功法第 ${result.page.page} / ${result.page.totalPages} 页，共 ${result.page.total} 条`);
    }
  } catch (error) {
    if (nonce !== generatedTechniqueCandidateRequestNonce) {
      return;
    }
    generatedTechniqueCandidateError = error instanceof Error ? error.message : t('gm.request.failed');
    generatedTechniqueCandidates = [];
    generatedTechniqueCandidatePageTotal = 1;
    generatedTechniqueCandidateTotal = 0;
  } finally {
    if (nonce === generatedTechniqueCandidateRequestNonce) {
      generatedTechniqueCandidateLoading = false;
      patchTechniqueManagerListsFromDraft();
    }
  }
}

function scheduleGeneratedTechniqueCandidateLoad(): void {
  if (techniqueCandidateSearchTimer !== null) {
    window.clearTimeout(techniqueCandidateSearchTimer);
  }
  techniqueCandidateSearchTimer = window.setTimeout(() => {
    techniqueCandidateSearchTimer = null;
    if (currentTechniqueCandidateSource === 'generated') {
      loadGeneratedTechniqueCandidates(true).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
      });
    }
  }, 250);
}

function buildGmDatabaseBackupDownloadApiPath(backupId: string): string {
  return apiBuildGmDatabaseBackupDownloadApiPath(backupId);
}

function buildGmServerLogsApiPath(beforeSeq?: number): string {
  return apiBuildGmServerLogsApiPath(beforeSeq, SERVER_LOG_PAGE_SIZE);
}

function buildGmWorkersApiPath(): string {
  return apiBuildGmWorkersApiPath();
}

function buildGmEnvironmentCheckApiPath(): string {
  return apiBuildGmEnvironmentCheckApiPath();
}

function buildGmDiagnosticsQueryApiPath(): string {
  return apiBuildGmDiagnosticsQueryApiPath();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return formatIsRecord(value);
}

function assertGmStateResponseShape(data: unknown): asserts data is GmStateRes {
  if (!isRecord(data)
    || !Array.isArray(data.players)
    || !Array.isArray(data.mapIds)
    || !isRecord(data.playerPage)
    || !Number.isFinite(data.playerPage.page)
    || !Number.isFinite(data.playerPage.pageSize)
    || !Number.isFinite(data.playerPage.total)
    || !Number.isFinite(data.playerPage.totalPages)
    || !isRecord(data.playerStats)
    || !Number.isFinite(data.playerStats.totalPlayers)
    || !Number.isFinite(data.playerStats.onlinePlayers)
    || !Number.isFinite(data.playerStats.offlineHangingPlayers)
    || !Number.isFinite(data.playerStats.offlinePlayers)
    || !isRecord(data.perf)) {
    throw new Error(t('gm.response.invalid-state'));
  }
}

function assertGmPlayerDetailResponseShape(data: unknown): asserts data is GmPlayerDetailRes {
  if (!isRecord(data) || !isRecord(data.player) || typeof data.player.id !== 'string') {
    throw new Error(t('gm.response.invalid-player-detail'));
  }
}
/** lastNetworkInStructureKey：last Network In Structure Key。 */
let lastNetworkInStructureKey: string | null = null;
/** lastNetworkOutStructureKey：last Network Out Structure Key。 */
let lastNetworkOutStructureKey: string | null = null;
/** lastCpuBreakdownStructureKey：last Cpu Breakdown Structure Key。 */
let lastCpuBreakdownStructureKey: string | null = null;
/** lastMemoryDomainStructureKey：last Memory Domain Structure Key。 */
let lastMemoryDomainStructureKey: string | null = null;
/** lastMemoryHeapSpaceStructureKey：last Memory Heap Space Structure Key。 */
let lastMemoryHeapSpaceStructureKey: string | null = null;
/** lastMemoryInstanceStructureKey：last Memory Instance Structure Key。 */
let lastMemoryInstanceStructureKey: string | null = null;
/** networkStatsActivationPending：网络统计启动请求是否进行中。 */
let networkStatsActivationPending = false;
/** lastPathfindingFailureStructureKey：last Pathfinding Failure Structure Key。 */
let lastPathfindingFailureStructureKey: string | null = null;
/** lastShortcutMailComposerStructureKey：last Shortcut邮件Composer Structure Key。 */
let lastShortcutMailComposerStructureKey: string | null = null;
/** databaseStateLoading：数据库状态Loading。 */
let databaseStateLoading = false;
/** serverLogsEntries：服务端日志已加载行。 */
let serverLogsEntries: GmServerLogEntry[] = [];
/** serverLogsNextBeforeSeq：服务端日志向上翻页游标。 */
let serverLogsNextBeforeSeq: number | undefined;
/** serverLogsHasMore：服务端日志是否还有更早行。 */
let serverLogsHasMore = false;
/** serverLogsBufferSize：服务端日志缓冲行数。 */
let serverLogsBufferSize = 0;
/** serverLogsLoading：服务端日志读取中。 */
let serverLogsLoading = false;
let serverDiagnosticsLoading = false;
let lastServerDiagnosticsResult: GmDiagnosticsQueryRes | null = null;
let lastExecCommand: string | null = null;
let lastExecPreviousCommand: string | null = null;
/** workerState：Worker状态。 */
let workerState: GmWorkerStateRes | null = null;
/** workerStateLoading：Worker状态读取中。 */
let workerStateLoading = false;
let envCheckResult: GmEnvCheckResult | null = null;
let envCheckLoading = false;
let runtimeFlags: Array<{ key: string; value: boolean }> = [];
let runtimeFlagsLoading = false;
const NETWORK_PAYLOAD_CAPTURE_FLAG_KEY = 'gm_network_payload_capture_enabled';

type ObjectCountsResponse = ServerPanelsObjectCountsResponse;
let objectCountsData: ObjectCountsResponse | null = null;
let objectsLoading = false;
let redeemGroupsState: RedeemCodeGroupView[] = [];
/** selectedRedeemGroupId：selected兑换分组ID。 */
let selectedRedeemGroupId: string | null = null;
/** redeemGroupDetailState：兑换分组详情状态。 */
let redeemGroupDetailState: GmRedeemCodeGroupDetailRes | null = null;
/** redeemDraft：兑换Draft。 */
let redeemDraft: RedeemGroupDraft = createDefaultRedeemGroupDraft();
/** redeemLoading：兑换Loading。 */
let redeemLoading = false;
let redeemLatestGeneratedCodes: string[] = [];
/** directMailDraftPlayerId：direct邮件Draft玩家ID。 */
let directMailDraftPlayerId: string | null = null;
/** directMailDraft：direct邮件Draft。 */
let directMailDraft = createDefaultMailComposerDraft();
/** broadcastMailDraft：broadcast邮件Draft。 */
let broadcastMailDraft = createDefaultMailComposerDraft();
const broadcastMailIdempotencyState = new GmMailBroadcastIdempotencyState();
/** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
let shortcutMailComposerRefreshBlocked = false;
/** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
let directMailAttachmentPageByIndex = new Map<number, number>();
/** shortcutMailAttachmentPageByIndex：shortcut邮件Attachment分页By索引。 */
let shortcutMailAttachmentPageByIndex = new Map<number, number>();
/** activeSearchableItemField：活跃Searchable物品字段。 */
let activeSearchableItemField: HTMLElement | null = null;
/** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
let editorRenderRefreshBlocked = false;

/** createDefaultMailAttachmentDraft：创建默认邮件Attachment Draft。 */
function createDefaultMailAttachmentDraft(): GmMailAttachmentDraft {
  return gmPureHelpers.createDefaultMailAttachmentDraft();
}

/** createDefaultRedeemGroupDraft：创建默认兑换分组Draft。 */
function createDefaultRedeemGroupDraft(): RedeemGroupDraft {
  return gmPureHelpers.createDefaultRedeemGroupDraft(gmPureHelpers.createDefaultRedeemReward);
}

/** createDefaultRedeemReward：创建默认兑换Reward。 */
function createDefaultRedeemReward(): RedeemCodeGroupRewardItem {
  return gmPureHelpers.createDefaultRedeemReward();
}

/** createDefaultMailComposerDraft：创建默认邮件Composer Draft。 */
function createDefaultMailComposerDraft(): GmMailComposerDraft {
  return gmPureHelpers.createDefaultMailComposerDraft();
}

/** ensureDirectMailDraft：确保Direct邮件Draft。 */
function ensureDirectMailDraft(playerId: string | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!playerId) {
    /** directMailDraftPlayerId：direct邮件Draft玩家ID。 */
    directMailDraftPlayerId = null;
    /** directMailDraft：direct邮件Draft。 */
    directMailDraft = createDefaultMailComposerDraft();
    /** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
    directMailAttachmentPageByIndex = new Map();
    return;
  }
  if (directMailDraftPlayerId === playerId) {
    return;
  }
  /** directMailDraftPlayerId：direct邮件Draft玩家ID。 */
  directMailDraftPlayerId = playerId;
  /** directMailDraft：direct邮件Draft。 */
  directMailDraft = createDefaultMailComposerDraft();
  /** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
  directMailAttachmentPageByIndex = new Map();
}

/** clone：克隆clone。 */
function clone<T>(value: T): T {
  return formatClone(value);
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(input: string): string {
  return formatEscapeHtml(input);
}

/** formatJson：格式化JSON。 */
function formatJson(value: unknown): string {
  return formatFormatJson(value);
}

/** formatBytes：格式化Bytes。 */
function formatBytes(bytes: number | undefined): string {
  return formatFormatBytes(bytes);
}

function formatSignedBytes(bytes: number | undefined): string {
  return formatFormatSignedBytes(bytes);
}

/** formatPercent：格式化Percent。 */
function formatPercent(numerator: number, denominator: number): string {
  return formatFormatPercent(numerator, denominator);
}

/** formatBytesPerSecond：格式化Bytes Per Second。 */
function formatBytesPerSecond(bytes: number, elapsedSec: number): string {
  return formatFormatBytesPerSecond(bytes, elapsedSec);
}

/** formatAverageBytesPerEvent：格式化Average Bytes Per事件。 */
function formatAverageBytesPerEvent(bytes: number, count: number): string {
  return formatFormatAverageBytesPerEvent(bytes, count);
}

/** formatDurationSeconds：格式化Duration Seconds。 */
function formatDurationSeconds(seconds: number): string {
  return formatFormatDurationSeconds(seconds);
}

/** formatDateTime：格式化Date时间。 */
function formatDateTime(value?: string): string {
  return formatFormatDateTime(value);
}

/** getPlayerPresenceMeta：读取玩家Presence元数据。 */
function getPlayerPresenceMeta(player: Pick<GmManagedPlayerSummary, 'meta'>): {
  className: 'online' | 'offline';
  label: '在线' | '离线挂机' | '离线';
} {
  return riskGetPlayerPresenceMeta(player);
}

/** getManagedAccountStatusLabel：读取托管账号状态标签。 */
function getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string {
  return riskGetManagedAccountStatusLabel(player);
}

/** getManagedAccountActivityMeta：读取托管账号Activity元数据。 */
function getManagedAccountActivityMeta(player: Pick<GmManagedPlayerRecord, 'meta'>): {
  label: string;
  value: string;
  note?: string;
} {
  return riskGetManagedAccountActivityMeta(player);
}

/** getManagedPlayerAccountStatusLabel：读取账号状态标签。 */
function getManagedPlayerAccountStatusLabel(status: GmManagedPlayerSummary['accountStatus']): string {
  return riskGetManagedPlayerAccountStatusLabel(status);
}

/** getManagedAccountRestrictionLabel：读取账号封禁状态标签。 */
function getManagedAccountRestrictionLabel(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return riskGetManagedAccountRestrictionLabel(account);
}

/** getManagedAccountRestrictionPillClass：读取账号封禁状态样式。 */
function getManagedAccountRestrictionPillClass(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return riskGetManagedAccountRestrictionPillClass(account);
}

/** getPlayerRiskLevelLabel：读取风险等级标签。 */
function getPlayerRiskLevelLabel(level: GmPlayerRiskLevel): string {
  return riskGetPlayerRiskLevelLabel(level);
}

/** getPlayerRiskLevelPillClass：读取风险等级样式。 */
function getPlayerRiskLevelPillClass(level: GmPlayerRiskLevel): string {
  return riskGetPlayerRiskLevelPillClass(level);
}

/** renderPlayerRiskFactorCard：渲染风险维度卡片。 */
function renderPlayerRiskFactorCard(factor: GmPlayerRiskFactor): string {
  return riskRenderPlayerRiskFactorCard(factor);
}

/** renderPlayerRiskSection：渲染玩家风险检测标签页。 */
function renderPlayerRiskSection(player: GmManagedPlayerRecord): string {
  return riskRenderPlayerRiskSection(player);
}

/** hasServerEditorCatalog：判断是否服务端编辑器目录。 */
function hasServerEditorCatalog(): boolean {
  return editorCatalogSource === 'server' && editorCatalog !== null;
}

/** getEditorCatalogFallbackNote：读取编辑器目录兜底Note。 */
function getEditorCatalogFallbackNote(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (editorCatalogSource === 'local-fallback') {
    return t('gm.client.editor-catalog.local-fallback-note');
  }
  if (editorCatalogSource === 'unavailable') {
    return t('gm.client.editor-catalog.unavailable-note');
  }
  return '';
}

/** assertTrustedEditorCatalog：处理assert Trusted编辑器目录。 */
function assertTrustedEditorCatalog(actionLabel: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (hasServerEditorCatalog()) {
    return;
  }
  throw new Error(t('gm.client.editor-catalog.action-paused', { actionLabel }));
}

/** getFilteredPlayers：读取Filtered Players。 */
function getFilteredPlayers(data: GmStateRes): GmManagedPlayerSummary[] {
  return data.players;
}

/** getPlayerIdentityLine：读取玩家身份Line。 */
function getPlayerIdentityLine(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerIdentityLine(player);
}

/** getPlayerStatsLine：读取玩家属性Line。 */
function getPlayerStatsLine(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerStatsLine(player);
}

/** getPlayerRowMarkup：读取玩家Row Markup。 */
function getPlayerRowMarkup(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerRowMarkup(player);
}

/** patchPlayerRow：处理patch玩家Row。 */
function patchPlayerRow(button: HTMLButtonElement, player: GmManagedPlayerSummary, isActive: boolean): void {
  const presence = getPlayerPresenceMeta(player);
  button.classList.toggle('active', isActive);
  button.querySelector<HTMLElement>('[data-role="name"]')!.textContent = `${player.roleName} · ${formatPlayerNo(player.playerNo)}`;
  const presenceEl = button.querySelector<HTMLElement>('[data-role="presence"]')!;
  presenceEl.classList.toggle('online', presence.className === 'online');
  presenceEl.classList.toggle('offline', presence.className === 'offline');
  presenceEl.textContent = presence.label;
  button.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = t('gm.client.player-list.meta', {
    accountName: player.accountName ?? t('gm.none'),
    status: getManagedPlayerAccountStatusLabel(player.accountStatus),
    riskScore: player.riskScore,
    riskLevel: getPlayerRiskLevelLabel(player.riskLevel),
  });
  button.querySelector<HTMLElement>('[data-role="identity"]')!.textContent = player.riskTags.length > 0
    ? t('gm.client.player-list.identity-with-risk-tags', { identity: getPlayerIdentityLine(player), tags: player.riskTags.join(' / ') })
    : getPlayerIdentityLine(player);
  button.querySelector<HTMLElement>('[data-role="stats"]')!.textContent = getPlayerStatsLine(player);
}

/** getEditorSubtitle：读取编辑器Subtitle。 */
function getEditorSubtitle(detail: GmManagedPlayerRecord): string {
  return [
    formatPlayerNo(detail.playerNo),
    t('gm.client.editor.subtitle.account', { accountName: detail.accountName ?? t('gm.none') }),
    t('gm.client.editor.subtitle.display-name', { displayName: detail.displayName }),
    t('gm.client.editor.subtitle.map', { mapName: detail.mapName, x: detail.x, y: detail.y }),
    detail.meta.updatedAt
      ? t('gm.client.editor.subtitle.persisted-at', { time: new Date(detail.meta.updatedAt).toLocaleString('zh-CN') })
      : t('gm.client.editor.subtitle.runtime-player'),
  ].join(' · ');
}

function formatPlayerNo(playerNo: number | null | undefined): string {
  return formatFormatPlayerNo(playerNo);
}

/** getEditorMetaMarkup：读取编辑器元数据Markup。 */
function getEditorMetaMarkup(detail: GmManagedPlayerRecord): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const presence = getPlayerPresenceMeta(detail);
  const base = gmMarkupHelpers.getEditorMetaMarkup(detail, presence, editorDirty);
  const riskMeta = `<span class="pill ${getPlayerRiskLevelPillClass(detail.riskLevel)}">${escapeHtml(t('gm.client.editor.meta.risk', { score: detail.riskScore, level: getPlayerRiskLevelLabel(detail.riskLevel) }))}</span>`;
  if (hasServerEditorCatalog()) {
    return `${base}${riskMeta}`;
  }
  return `${base}${riskMeta}<span class="pill">${escapeHtml(editorCatalogSource === 'local-fallback' ? t('gm.client.editor.meta.catalog-local-fallback') : t('gm.client.editor.meta.catalog-unavailable'))}</span>`;
}

/** getEditorBodyChipMarkup：读取编辑器身体Chip Markup。 */
function getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState): string {
  return gmMarkupHelpers.getEditorBodyChipMarkup(player, draft, editorDirty);
}

/** getEquipmentCardTitle：读取Equipment卡片标题。 */
function getEquipmentCardTitle(item: ItemStack | null): string {
  return item ? gmCatalogHelpers.getResolvedItemDisplayName(editorCatalog, item, '未命名装备') : '';
}

/** getEquipmentCardMeta：读取Equipment卡片元数据。 */
function getEquipmentCardMeta(item: ItemStack | null): string {
  return item ? gmCatalogHelpers.getResolvedInventoryRowMeta(editorCatalog, item) : '当前为空';
}

/** getBonusCardTitle：读取Bonus卡片标题。 */
function getBonusCardTitle(bonus: PlayerState['bonuses'][number] | undefined, index: number): string {
  return gmMarkupHelpers.getBonusCardTitle(bonus, index);
}

/** getBonusCardMeta：读取Bonus卡片元数据。 */
function getBonusCardMeta(bonus: PlayerState['bonuses'][number] | undefined): string {
  return gmMarkupHelpers.getBonusCardMeta(bonus);
}

/** getBuffCardTitle：读取Buff卡片标题。 */
function getBuffCardTitle(buff: TemporaryBuffState | undefined, index: number): string {
  return gmMarkupHelpers.getBuffCardTitle(buff, index);
}

/** getBuffCardMeta：读取Buff卡片元数据。 */
function getBuffCardMeta(buff: TemporaryBuffState | undefined): string {
  return gmMarkupHelpers.getBuffCardMeta(buff);
}

/** getInventoryCardTitle：读取背包卡片标题。 */
function getInventoryCardTitle(item: ItemStack | undefined, index: number): string {
  return gmCatalogHelpers.getResolvedItemDisplayName(editorCatalog, item, `物品 ${index + 1}`);
}

/** getInventoryCardMeta：读取背包卡片元数据。 */
function getInventoryCardMeta(item: ItemStack | undefined): string {
  return item ? gmCatalogHelpers.getResolvedInventoryRowMeta(editorCatalog, item) : '';
}

/** getAutoSkillCardTitle：读取自动技能卡片标题。 */
function getAutoSkillCardTitle(entry: AutoBattleSkillConfig | undefined, index: number): string {
  return gmMarkupHelpers.getAutoSkillCardTitle(entry, index);
}

/** getAutoSkillCardMeta：读取自动技能卡片元数据。 */
function getAutoSkillCardMeta(entry: AutoBattleSkillConfig | undefined): string {
  return gmMarkupHelpers.getAutoSkillCardMeta(entry);
}

/** getTechniqueCardTitle：读取Technique卡片标题。 */
function getTechniqueCardTitle(technique: TechniqueState | undefined, index: number): string {
  return gmMarkupHelpers.getTechniqueCardTitle(technique, index);
}

/** getTechniqueCardMeta：读取Technique卡片元数据。 */
function getTechniqueCardMeta(technique: TechniqueState | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!technique) return '';
  return gmMarkupHelpers.getTechniqueCardMeta(technique, (realmLv) => (
    editorCatalog?.realmLevels.find((entry) => entry.realmLv === realmLv)?.displayName
  ));
}

/** getQuestCardTitle：读取任务卡片标题。 */
function getQuestCardTitle(quest: QuestState | undefined, index: number): string {
  return gmMarkupHelpers.getQuestCardTitle(quest, index);
}

/** getQuestCardMeta：读取任务卡片元数据。 */
function getQuestCardMeta(quest: QuestState | undefined): string {
  return gmMarkupHelpers.getQuestCardMeta(quest);
}

/** getTechniqueOptionLabel：读取Technique选项标签。 */
function getTechniqueOptionLabel(option: GmEditorTechniqueOption): string {
  return catalogGetTechniqueOptionLabel(option, editorCatalog);
}

/** getItemOptionLabel：读取物品选项标签。 */
function getItemOptionLabel(option: GmEditorItemOption): string {
  return catalogGetItemOptionLabel(option);
}

/** getTechniqueCatalogOptions：读取Technique目录选项。 */
function getTechniqueCatalogOptions(includeEmpty = false): Array<{ value: string; label: string }> {
  return catalogGetTechniqueCatalogOptions(editorCatalog, hasServerEditorCatalog(), includeEmpty);
}

/** getLearnedTechniqueOptions：读取Learned Technique选项。 */
function getLearnedTechniqueOptions(techniques: TechniqueState[], includeEmpty = false): Array<{ value: string; label: string }> {
  return catalogGetLearnedTechniqueOptions(techniques, includeEmpty);
}

/** getRealmCatalogOptions：读取境界目录选项。 */
function getRealmCatalogOptions(): Array<{ value: number; label: string }> {
  return catalogGetRealmCatalogOptions(editorCatalog);
}

/** getItemCatalogOptions：读取物品目录选项。 */
function getItemCatalogOptions(filter?: (option: GmEditorItemOption) => boolean): Array<{ value: string; label: string }> {
  return catalogGetItemCatalogOptions(editorCatalog, hasServerEditorCatalog(), filter);
}

/** getBuffOptionLabel：读取Buff选项标签。 */
function getBuffOptionLabel(option: GmEditorBuffOption): string {
  return catalogGetBuffOptionLabel(option);
}

/** getBuffCatalogOptions：读取Buff目录选项。 */
function getBuffCatalogOptions(selectedBuffId?: string): Array<{ value: string; label: string }> {
  return catalogGetBuffCatalogOptions(editorCatalog, hasServerEditorCatalog(), selectedBuffId);
}

/** getMailAttachmentItemOptions：读取邮件Attachment物品选项。 */
function getMailAttachmentItemOptions(): Array<{ value: string; label: string }> {
  return catalogGetMailAttachmentItemOptions(editorCatalog);
}

/** getMailAttachmentPageStore：读取邮件Attachment分页存储。 */
function getMailAttachmentPageStore(scope: 'direct' | 'shortcut'): Map<number, number> {
  return scope === 'direct' ? directMailAttachmentPageByIndex : shortcutMailAttachmentPageByIndex;
}

/** resetMailAttachmentPageStore：重置邮件Attachment分页存储。 */
function resetMailAttachmentPageStore(scope: 'direct' | 'shortcut'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (scope === 'direct') {
    /** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
    directMailAttachmentPageByIndex = new Map();
    return;
  }
  /** shortcutMailAttachmentPageByIndex：shortcut邮件Attachment分页By索引。 */
  shortcutMailAttachmentPageByIndex = new Map();
}

/** getMailAttachmentItemPageState：读取邮件Attachment物品分页状态。 */
function getMailAttachmentItemPageState(
  scope: 'direct' | 'shortcut',
  attachmentIndex: number,
  selectedItemId: string,
): {
/**
 * page：page相关字段。
 */

  page: number;  
  /**
 * totalPages：totalPage相关字段。
 */

  totalPages: number;  
  /**
 * options：option相关字段。
 */

  options: Array<{  
  /**
 * value：值数值。
 */
 value: string;  
 /**
 * label：label名称或显示文本。
 */
 label: string }>;
} {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const allOptions = getMailAttachmentItemOptions();
  const totalPages = Math.max(1, Math.ceil(allOptions.length / MAIL_ATTACHMENT_ITEM_PAGE_SIZE));
  const selectedIndex = selectedItemId
    ? allOptions.findIndex((option) => option.value === selectedItemId)
    : -1;
  const fallbackPage = selectedIndex >= 0
    ? Math.floor(selectedIndex / MAIL_ATTACHMENT_ITEM_PAGE_SIZE) + 1
    : 1;
  const pageStore = getMailAttachmentPageStore(scope);
  const storedPage = pageStore.get(attachmentIndex) ?? fallbackPage;
  const page = Math.min(totalPages, Math.max(1, storedPage));
  if (pageStore.get(attachmentIndex) !== page) {
    pageStore.set(attachmentIndex, page);
  }
  const start = (page - 1) * MAIL_ATTACHMENT_ITEM_PAGE_SIZE;
  const pagedOptions = allOptions.slice(start, start + MAIL_ATTACHMENT_ITEM_PAGE_SIZE);
  const selectedOption = selectedItemId
    ? allOptions.find((option) => option.value === selectedItemId) ?? null
    : null;
  const options = selectedOption && !pagedOptions.some((option) => option.value === selectedOption.value)
    ? [selectedOption, ...pagedOptions]
    : pagedOptions;
  return {
    page,
    totalPages,
    options,
  };
}

/** updateMailAttachmentItemPage：更新邮件Attachment物品分页。 */
function updateMailAttachmentItemPage(scope: 'direct' | 'shortcut', attachmentIndex: number, rawValue: string): void {
  const page = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
  getMailAttachmentPageStore(scope).set(attachmentIndex, page);
}

/** getMailAttachmentTitle：读取邮件Attachment标题。 */
function getMailAttachmentTitle(itemId: string, fallbackLabel: string): string {
  if (!itemId) {
    return fallbackLabel;
  }
  return gmCatalogHelpers.findItemCatalogEntry(editorCatalog, itemId)?.name?.trim() || '未知物品';
}

/** getMailAttachmentRowMeta：读取邮件Attachment Row元数据。 */
function getMailAttachmentRowMeta(itemId: string): string {
  return gmCatalogHelpers.getMailAttachmentRowMeta(editorCatalog, itemId);
}

/** getMailTemplateOptionMeta：读取邮件模板选项元数据。 */
function getMailTemplateOptionMeta(templateId: string): {
/**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * description：description相关字段。
 */
 description: string } | null {
  return gmCatalogHelpers.getMailTemplateOptionMeta(templateId);
}

/** isServerManagedMailTemplate：判断是否服务端托管邮件模板。 */
function isServerManagedMailTemplate(templateId: string): boolean {
  return gmCatalogHelpers.isServerManagedMailTemplate(templateId);
}

/** getShortcutMailTargetOptions：读取Shortcut邮件目标选项。 */
function getShortcutMailTargetOptions(): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const players = state?.players.filter((player) => !player.meta.isBot) ?? [];
  const options = [
    { value: '', label: t('gm.text.all-player-recipients') },
    ...players.map((player) => ({
      value: player.id,
      label: `${player.roleName} · ${formatPlayerNo(player.playerNo)} · ${player.accountName || t('gm.text.no-account')} · ${player.meta.online ? t('gm.online') : t('gm.offline')}`,
    })),
  ];
  const selectedTargetId = broadcastMailDraft.targetPlayerId.trim();
  if (selectedTargetId && !options.some((option) => option.value === selectedTargetId)) {
    const fallbackLabel = selectedPlayerDetail?.id === selectedTargetId
      ? `${selectedPlayerDetail.roleName} · ${formatPlayerNo(selectedPlayerDetail.playerNo)} · ${selectedPlayerDetail.account?.username || t('gm.text.no-account')} · ${t('gm.text.selected')}`
      : `未知角色 · ${t('gm.text.current-target', { targetId: '未加载' })}`;
    options.push({ value: selectedTargetId, label: fallbackLabel });
  }
  return options;
}

/** getMailComposerPayload：读取邮件Composer载荷。 */
function getMailComposerPayload(draft: GmMailComposerDraft): GmCreateMailReq {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const templateId = draft.templateId.trim();
  const usesServerManagedTemplate = isServerManagedMailTemplate(templateId);
  const title = draft.title.trim();
  const body = draft.body.trim();
  const senderLabel = draft.senderLabel.trim() || t('gm.mail.sender.default');
  const expireHours = Math.floor(Number(draft.expireHours || '0'));
  const attachments: MailAttachment[] = usesServerManagedTemplate
    ? []
    : draft.attachments
      .filter((entry) => entry.itemId.trim().length > 0 && Number.isFinite(entry.count) && entry.count > 0)
      .map((entry) => ({
        itemId: entry.itemId.trim(),
        count: Math.max(1, Math.floor(entry.count)),
      }));

  if (!templateId && !title && !body && attachments.length === 0) {
    throw new Error(t('gm.mail.compose.required'));
  }

  return {
    templateId: templateId || undefined,
    fallbackTitle: !templateId && title ? title : undefined,
    fallbackBody: !templateId && body ? body : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    senderLabel,
    expireAt: expireHours > 0 ? Date.now() + expireHours * 3600 * 1000 : null,
  };
}

/** getMailComposerMarkup：读取邮件Composer Markup。 */
const mailComposerDeps = {
  isServerManagedMailTemplate,
  getMailTemplateOptionMeta,
  hasServerEditorCatalog,
  getEditorCatalogFallbackNote,
  getMailAttachmentTitle,
  getMailAttachmentRowMeta,
  searchableItemField,
  getShortcutMailTargetOptions,
  mailTemplateOptions: GM_MAIL_TEMPLATE_OPTIONS,
};

function getMailComposerMarkup(
  draft: GmMailComposerDraft,
  options: {
    scope: 'direct' | 'shortcut';
    submitLabel: string;
    note: string;
    showTargetPlayer?: boolean;
  },
): string {
  return mailComposerGetMailComposerMarkupHtml(draft, options, mailComposerDeps);
}
/** getInventoryAddTypeOptions：读取背包Add类型选项。 */
function getInventoryAddTypeOptions(): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  return ITEM_TYPES.map((type) => ({
    value: type,
    label: ITEM_TYPE_LABELS[type],
  }));
}

/** getInventoryAddItemOptions：读取背包Add物品选项。 */
function getInventoryAddItemOptions(): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  return getItemCatalogOptions((option) => option.type === currentInventoryAddType);
}

/** findTechniqueCatalogEntry：查找Technique目录条目。 */
function findTechniqueCatalogEntry(techId: string | undefined): GmEditorTechniqueOption | null {
  return catalogFindTechniqueCatalogEntry(editorCatalog, techId);
}

/** findItemCatalogEntry：查找物品目录条目。 */
function findItemCatalogEntry(itemId: string | undefined): GmEditorItemOption | null {
  return catalogFindItemCatalogEntry(editorCatalog, itemId);
}

/** findBuffCatalogEntry：查找Buff目录条目。 */
function findBuffCatalogEntry(buffId: string | undefined): GmEditorBuffOption | null {
  return catalogFindBuffCatalogEntry(editorCatalog, buffId);
}

/** createTechniqueFromCatalog：创建Technique From目录。 */
function createTechniqueFromCatalog(techId: string): TechniqueState {
  return catalogCreateTechniqueFromCatalog(techId, editorCatalog, createDefaultTechnique);
}

/** createItemFromCatalog：创建物品From目录。 */
function createItemFromCatalog(itemId: string, count = 1): ItemStack {
  return catalogCreateItemFromCatalog(itemId, editorCatalog, createDefaultItem, count);
}

/** createBuffFromCatalog：创建Buff From目录。 */
function createBuffFromCatalog(
  buffId: string,
  current?: Pick<TemporaryBuffState, 'stacks' | 'remainingTicks'>,
): TemporaryBuffState {
  return catalogCreateBuffFromCatalog(buffId, editorCatalog, createDefaultBuff, current);
}

/** getTechniqueSummary：读取Technique摘要。 */
function getTechniqueSummary(technique: TechniqueState): string {
  return catalogGetTechniqueSummary(technique);
}

/** getTechniqueTemplateMaxLevel：读取Technique模板最大等级。 */
function getTechniqueTemplateMaxLevel(technique: TechniqueState): number {
  return catalogGetTechniqueTemplateMaxLevel(technique, editorCatalog);
}

/** buildMaxLevelTechniqueState：构建最大等级Technique状态。 */
function buildMaxLevelTechniqueState(technique: TechniqueState): TechniqueState {
  return catalogBuildMaxLevelTechniqueState(technique, editorCatalog, createDefaultTechnique);
}

/** getInventoryRowMeta：读取背包Row元数据。 */
function getInventoryRowMeta(item: ItemStack): string {
  return catalogGetInventoryRowMeta(editorCatalog, item);
}

/** getTechniqueEditorControls：读取Technique编辑器Controls。 */
function getTechniqueEditorControls(index: number, technique: TechniqueState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const catalogEntry = findTechniqueCatalogEntry(technique.techId);
  if (catalogEntry) {
    return `
      <div class="editor-grid compact">
        ${selectField('功法', `techniques.${index}.techId`, technique.techId, getTechniqueCatalogOptions())}
        ${numberField('等级', `techniques.${index}.level`, technique.level)}
        ${numberField('经验', `techniques.${index}.exp`, technique.exp)}
        <div class="editor-field">
          <span>功法境界</span>
          <div class="editor-code">${escapeHtml(TECHNIQUE_REALM_LABELS[technique.realm] ?? '未知境界')}</div>
        </div>
        <div class="editor-field">
          <span>境界等级</span>
          <div class="editor-code">${escapeHtml(String(technique.realmLv))}</div>
        </div>
        <div class="editor-field">
          <span>升级所需经验</span>
          <div class="editor-code">${escapeHtml(String(technique.expToNext))}</div>
        </div>
        <div class="editor-field wide">
          <span>当前模板</span>
          <div class="editor-code">${escapeHtml(getTechniqueSummary(technique))}</div>
        </div>
      </div>
      <div class="editor-note">
        该功法来自策划模板，名称、品阶、功法境界、层级和升级所需经验都会由服务端按模板重算；GM 这里仅建议改等级与当前经验。
      </div>
    `;
  }

  return `
    <div class="editor-grid compact">
      ${selectField('功法', `techniques.${index}.techId`, technique.techId, getTechniqueCatalogOptions())}
      ${numberField('境界等级', `techniques.${index}.realmLv`, technique.realmLv)}
      ${selectField('功法境界', `techniques.${index}.realm`, technique.realm, GM_TECHNIQUE_REALM_OPTIONS)}
      ${numberField('等级', `techniques.${index}.level`, technique.level)}
      ${numberField('经验', `techniques.${index}.exp`, technique.exp)}
      ${numberField('升级所需经验', `techniques.${index}.expToNext`, technique.expToNext)}
      <div class="editor-field wide">
        <span>当前模板</span>
        <div class="editor-code">${escapeHtml(getTechniqueSummary(technique))}</div>
      </div>
    </div>
  `;
}

/** getItemEditorControls：读取物品编辑器Controls。 */
function getItemEditorControls(basePath: string, item: ItemStack, mode: 'inventory' | 'equipment' | 'artifact'): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const catalogEntry = findItemCatalogEntry(item.itemId);
  const enhancementField = shouldShowEnhancementLevelField(item)
    ? numberField('强化等级', `${basePath}.enhanceLevel`, item.enhanceLevel)
    : '';
  const itemScope: SearchableItemScope = mode === 'inventory'
    ? 'all'
    : mode === 'artifact'
      ? 'artifact-slot'
      : 'equipment-slot';
  const itemLabel = mode === 'artifact'
    ? '法宝模板'
    : mode === 'equipment'
      ? '装备模板'
      : '物品';
  const itemSlot = mode === 'equipment' ? item.equipSlot : undefined;
  if (catalogEntry) {
    return `
      <div class="editor-grid compact">
        ${searchableItemField(
          itemLabel,
          item.itemId,
          itemScope,
          { 'data-bind': `${basePath}.itemId`, 'data-kind': 'string' },
          'wide',
          itemSlot,
        )}
        ${mode === 'inventory' ? numberField('数量', `${basePath}.count`, item.count) : ''}
        ${enhancementField}
        <div class="editor-field">
          <span>模板等级</span>
          <div class="editor-code">${escapeHtml(String(item.level ?? '-'))}</div>
        </div>
        <div class="editor-field">
          <span>模板品阶</span>
          <div class="editor-code">${escapeHtml(item.grade ?? '-')}</div>
        </div>
        <div class="editor-field wide">
          <span>当前模板</span>
          <div class="editor-code">${escapeHtml(getInventoryRowMeta(item))}</div>
        </div>
      </div>
      <div class="editor-note">
        该物品来自策划模板，等级、品阶、装备属性、数值和特效会在服务端按模板补全；GM 这里仅建议改模板 ID、数量和强化等级。
      </div>
    `;
  }

  return `
    <div class="editor-grid compact">
      ${searchableItemField(
        itemLabel,
        item.itemId,
        itemScope,
        { 'data-bind': `${basePath}.itemId`, 'data-kind': 'string' },
        'wide',
        itemSlot,
      )}
      ${mode === 'inventory' ? numberField('数量', `${basePath}.count`, item.count) : ''}
      ${enhancementField}
      ${numberField('等级', `${basePath}.level`, item.level)}
      ${nullableTextField('品阶', `${basePath}.grade`, item.grade, 'undefined')}
      ${mode === 'artifact'
        ? `
          ${numberField('最大灵气系数', `${basePath}.artifactMaxQiFactor`, item.artifactMaxQiFactor)}
          ${jsonField('法宝特效', `${basePath}.artifactEffects`, item.artifactEffects ?? [], 'array', 'wide')}
        `
        : `
          ${jsonField('装备属性', `${basePath}.equipAttrs`, item.equipAttrs ?? {}, 'object')}
          ${jsonField('装备数值', `${basePath}.equipStats`, item.equipStats ?? {}, 'object')}
          ${jsonField('特效配置', `${basePath}.effects`, item.effects ?? [], 'array', 'wide')}
        `}
    </div>
  `;
}

function shouldShowEnhancementLevelField(item: ItemStack): boolean {
  const catalogEntry = findItemCatalogEntry(item.itemId);
  const resolvedType = catalogEntry?.type ?? item.type;
  if (resolvedType === 'equipment' || resolvedType === 'artifact') {
    return true;
  }
  return !catalogEntry && !resolvedType && Number(item.enhanceLevel ?? 0) > 0;
}

function normalizeInventorySearchText(value: string): string {
  return editorNormalizeInventorySearchText(value);
}

function getInventoryItemSearchText(item: ItemStack, index: number): string {
  const catalogEntry = findItemCatalogEntry(item.itemId);
  return normalizeInventorySearchText([
    getInventoryCardTitle(item, index),
    getInventoryCardMeta(item),
    item.itemId,
    item.name,
    catalogEntry?.name,
    catalogEntry?.type,
    catalogEntry?.equipSlot,
    item.type,
    item.equipSlot,
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).join(' '));
}

function getVisibleInventoryItems(items: ItemStack[]): Array<{ item: ItemStack; index: number }> {
  const query = normalizeInventorySearchText(currentInventorySearchQuery);
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => !query || getInventoryItemSearchText(item, index).includes(query));
}

function getInventoryListMarkup(items: ItemStack[]): string {
  const visibleItems = getVisibleInventoryItems(items);
  if (items.length === 0) {
    return '<div class="editor-note">背包为空。</div>';
  }
  if (visibleItems.length === 0) {
    return '<div class="editor-note">没有匹配的物品。</div>';
  }
  return visibleItems.map(({ item, index }) => getCompactInventoryItemMarkup(item, index)).join('');
}

function patchInventoryListFromDraft(): void {
  if (!draftSnapshot) {
    return;
  }
  const listEl = editorContentEl.querySelector<HTMLElement>('[data-inventory-compact-list]');
  const countEl = editorContentEl.querySelector<HTMLElement>('[data-inventory-search-count]');
  if (!listEl) {
    return;
  }
  const items = ensureArray(draftSnapshot.inventory.items);
  listEl.innerHTML = getInventoryListMarkup(items);
  if (countEl) {
    const visibleCount = getVisibleInventoryItems(items).length;
    countEl.textContent = currentInventorySearchQuery.trim()
      ? `显示 ${visibleCount} / ${items.length} 项`
      : `共 ${items.length} 项`;
  }
}

/** getCompactInventoryItemMarkup：读取Compact背包物品Markup。 */
function getCompactInventoryItemMarkup(item: ItemStack, index: number): string {
  const searchText = getInventoryItemSearchText(item, index);
  return `
    <div class="editor-card inventory-compact-row" data-inventory-item-row data-index="${index}" data-search="${escapeHtml(searchText)}">
      <div class="editor-card-head">
        <div>
          <div class="editor-card-title" data-preview="inventory-title" data-index="${index}">${escapeHtml(getInventoryCardTitle(item, index))}</div>
          <div class="editor-card-meta" data-preview="inventory-meta" data-index="${index}">${escapeHtml(getInventoryCardMeta(item))}</div>
        </div>
        <button class="small-btn danger" type="button" data-action="remove-inventory-item" data-index="${index}">删除</button>
      </div>
      <div class="editor-grid compact">
        ${numberField('数量', `inventory.items.${index}.count`, item.count)}
        ${shouldShowEnhancementLevelField(item) ? numberField('强化等级', `inventory.items.${index}.enhanceLevel`, item.enhanceLevel) : ''}
      </div>
    </div>
  `;
}

/** getReadonlyPreviewValue：读取Readonly Preview值。 */
function getReadonlyPreviewValue(draft: PlayerState, path: string): string {
  return gmMarkupHelpers.getReadonlyPreviewValue(draft, path);
}

/** buildEditorStructureKey：构建编辑器Structure Key。 */
function buildEditorStructureKey(detail: GmManagedPlayerRecord, draft: PlayerState): string {
  const mapIds = Array.from(new Set([...(state?.mapIds ?? []), draft.mapId])).sort().join(',');
  const mapPickerKey = [
    gmMapSummaries.map((entry) => `${entry.id}:${entry.name}:${entry.mapGroupId ?? ''}`).join(','),
    gmWorldInstances.map((entry) => `${entry.instanceId}:${entry.templateId}:${entry.linePreset}:${entry.defaultEntry ? 1 : 0}`).join(','),
    positionMapCategoryDraft?.playerId === detail.id ? positionMapCategoryDraft.category : '',
  ].join('#');
  const equipmentPresence = EQUIP_SLOTS.map((slot) => (draft.equipment[slot] ? '1' : '0')).join('');
  const artifactPresence = normalizeGmArtifactState(draft.artifacts).slots
    .map((entry) => `${entry.slot}:${entry.item ? '1' : '0'}:${entry.unlocked ? '1' : '0'}:${entry.enabled ? '1' : '0'}`)
    .join(',');
  return [
    detail.id,
    mapIds,
    mapPickerKey,
    equipmentPresence,
    artifactPresence,
    detail.account?.status ?? 'no-account',
    String(detail.riskReport.score),
    detail.riskReport.level,
    detail.riskReport.factors.map((factor) => `${factor.key}:${factor.score}`).join(','),
    ensureArray(draft.bonuses).length,
    ensureArray(draft.temporaryBuffs).length,
    ensureArray(draft.inventory.items).length,
    ensureArray(draft.autoBattleSkills).length,
    ensureArray(draft.techniques).length,
    currentTechniqueEditorSubtab,
    currentTechniqueCandidateSource,
    currentTechniqueCategoryFilter,
    currentTechniqueGradeFilter,
    currentTechniqueRealmLvFilter,
    currentTechniqueSearchQuery,
    currentTechniqueCandidatePage,
    currentTechniqueLearnedPage,
    currentTechniquePageSize,
    generatedTechniqueCandidatePageTotal,
    generatedTechniqueCandidateTotal,
    generatedTechniqueCandidates.map((entry) => `${entry.id}:${entry.updatedAt}`).join(','),
    GM_CRAFT_SKILL_EDITOR_ENTRIES.map((entry) => {
      const skill = getCraftSkillDraft(draft, entry.key);
      return `${entry.key}:${skill.level}:${skill.exp}:${skill.expToNext}`;
    }).join(','),
    ensureArray(draft.quests).length,
    `${detail.monthCard?.totalPoolMerit ?? 0}:${detail.monthCard?.remainingPoolMerit ?? 0}`,
  ].join('|');
}

/** setTextLikeValue：处理set文本Like值。 */
function setTextLikeValue(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  preserveFocusedField = true,
): void {
  editorSetTextLikeValue(field, value, preserveFocusedField);
}

/** syncVisualEditorFieldsFromDraft：同步Visual编辑器字段From Draft。 */
function syncVisualEditorFieldsFromDraft(draft: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const fields = editorContentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-bind]');
  for (const field of fields) {
    const path = field.dataset.bind;
    const kind = field.dataset.kind;
    if (!path || !kind) continue;
    const rawValue = getValueByPath(draft, path);
    if (kind === 'boolean' && field instanceof HTMLInputElement) {
      const checked = Boolean(rawValue);
      if (document.activeElement === field) continue;
      if (field.checked !== checked) {
        field.checked = checked;
      }
      continue;
    }
    if (kind === 'number') {
      setTextLikeValue(field, Number.isFinite(rawValue) ? String(rawValue) : '0');
      continue;
    }
    if (kind === 'nullable-string') {
      setTextLikeValue(field, typeof rawValue === 'string' ? rawValue : '');
      continue;
    }
    if (kind === 'string-array') {
      setTextLikeValue(field, Array.isArray(rawValue) ? rawValue.join('\n') : '');
      continue;
    }
    if (kind === 'json') {
      const emptyJson = field.dataset.emptyJson;
      const fallback = emptyJson === 'array' ? [] : emptyJson === 'null' ? null : {};
      setTextLikeValue(field, formatJson(rawValue ?? fallback));
      continue;
    }
    setTextLikeValue(field, rawValue == null ? '' : String(rawValue));
  }
  syncSearchableItemFields(editorContentEl);
}

/** patchEditorPreview：处理patch编辑器Preview。 */
function patchEditorPreview(detail: GmManagedPlayerRecord, draft: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const equipment = draft.equipment as EquipmentSlots;
  for (const slot of EQUIP_SLOTS) {
    const item = equipment[slot];
    editorContentEl.querySelector<HTMLElement>(`[data-preview="equipment-title"][data-slot="${slot}"]`)!.textContent = getEquipmentCardTitle(item);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="equipment-meta"][data-slot="${slot}"]`)!.textContent = getEquipmentCardMeta(item);
  }
  for (const entry of normalizeGmArtifactState(draft.artifacts).slots) {
    const titleEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="artifact-title"][data-slot="${entry.slot}"]`);
    if (titleEl) {
      titleEl.textContent = getEquipmentCardTitle(entry.item);
    }
    const metaEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="artifact-meta"][data-slot="${entry.slot}"]`);
    if (metaEl) {
      const stateLabel = entry.unlocked ? (entry.enabled ? '启用' : '停用') : '未解锁';
      metaEl.textContent = `${stateLabel} · ${getEquipmentCardMeta(entry.item)} · 灵力 ${Math.max(0, Math.trunc(Number(entry.qi) || 0))} / ${Math.max(0, Math.trunc(Number(entry.maxQi) || 0))}`;
    }
  }

  ensureArray(draft.bonuses).forEach((bonus, index) => {
    editorContentEl.querySelector<HTMLElement>(`[data-preview="bonus-title"][data-index="${index}"]`)!.textContent = getBonusCardTitle(bonus, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="bonus-meta"][data-index="${index}"]`)!.textContent = getBonusCardMeta(bonus);
  });
  ensureArray(draft.temporaryBuffs).forEach((buff, index) => {
    const titleEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="buff-title"][data-index="${index}"]`);
    if (titleEl) {
      titleEl.textContent = getBuffCardTitle(buff, index);
    }
    const metaEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="buff-meta"][data-index="${index}"]`);
    if (metaEl) {
      metaEl.textContent = getBuffCardMeta(buff);
    }
  });
  ensureArray(draft.inventory.items).forEach((item, index) => {
    const titleEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="inventory-title"][data-index="${index}"]`);
    if (titleEl) {
      titleEl.textContent = getInventoryCardTitle(item, index);
    }
    const metaEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="inventory-meta"][data-index="${index}"]`);
    if (metaEl) {
      metaEl.textContent = getInventoryCardMeta(item);
    }
  });
  ensureArray(draft.autoBattleSkills).forEach((entry, index) => {
    editorContentEl.querySelector<HTMLElement>(`[data-preview="auto-skill-title"][data-index="${index}"]`)!.textContent = getAutoSkillCardTitle(entry, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="auto-skill-meta"][data-index="${index}"]`)!.textContent = getAutoSkillCardMeta(entry);
  });
  ensureArray(draft.techniques).forEach((technique, index) => {
    const titleEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="technique-title"][data-index="${index}"]`);
    if (titleEl) {
      titleEl.textContent = getTechniqueCardTitle(technique, index);
    }
    const metaEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="technique-meta"][data-index="${index}"]`);
    if (metaEl) {
      metaEl.textContent = getTechniqueCardMeta(technique);
    }
  });
  ensureArray(draft.quests).forEach((quest, index) => {
    editorContentEl.querySelector<HTMLElement>(`[data-preview="quest-title"][data-index="${index}"]`)!.textContent = getQuestCardTitle(quest, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="quest-meta"][data-index="${index}"]`)!.textContent = getQuestCardMeta(quest);
  });

  const chipListEl = editorContentEl.querySelector<HTMLElement>('[data-preview="base-chips"]');
  if (chipListEl) {
    chipListEl.innerHTML = getEditorBodyChipMarkup(detail, draft);
  }
  for (const key of ATTR_KEYS) {
    const totalValue = draft.finalAttrs?.[key] ?? draft.baseAttrs?.[key] ?? DEFAULT_BASE_ATTRS[key];
    const totalEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="attr-total"][data-key="${key}"]`);
    if (totalEl) {
      totalEl.textContent = getAttrDisplayNumber(totalValue, DEFAULT_BASE_ATTRS[key]);
    }
  }
  editorContentEl.querySelectorAll<HTMLElement>('[data-preview="readonly"]').forEach((element) => {
    const path = element.dataset.path;
    if (!path) return;
    element.textContent = getReadonlyPreviewValue(draft, path);
  });
}

/** clearEditorRenderCache：清理编辑器渲染缓存。 */
function clearEditorRenderCache(): void {
  /** lastEditorStructureKey：last编辑器Structure Key。 */
  lastEditorStructureKey = null;
  editorContentEl.innerHTML = '';
}

/** getVisibleNetworkBuckets：读取可见Network Buckets。 */
function getVisibleNetworkBuckets(buckets: GmNetworkBucket[]): GmNetworkBucket[] {
  return statGetVisibleNetworkBuckets(buckets);
}

/** getNetworkBucketMeta：读取Network Bucket元数据。 */
function getNetworkBucketMeta(
  totalBytes: number,
  bucket: GmNetworkBucket,
  elapsedSec: number,
): string {
  return statGetNetworkBucketMeta(totalBytes, bucket, elapsedSec);
}

/** getTickPerf：读取Tick性能。 */
function getTickPerf(perf: GmStateRes['perf']) {
  return statGetTickPerf(perf);
}

/** getStatRowMarkup：读取Stat Row Markup。 */
function getStatRowMarkup(key: string): string {
  return statGetStatRowMarkup(key);
}

type StructuredStatListItem = StatStructuredStatListItem;

type MetricTreeSortDirection = PerfMetricTreeSortDirection;
type MetricTreeColumn<TNode, TContext> = PerfMetricTreeColumn<TNode, TContext>;
type MetricTreeTableOptions<TNode, TContext> = PerfMetricTreeTableOptions<TNode, TContext>;

/** patchStatRow：处理patch Stat Row。 */
function patchStatRow(row: HTMLElement, item: StructuredStatListItem): void {
  return statPatchStatRow(row, item);
}

/** renderStructuredStatList：渲染Structured Stat列表。 */
function renderStructuredStatList(
  container: HTMLElement,
  structureKey: string | null,
  items: StructuredStatListItem[],
  emptyText: string,
): string {
  return statRenderStructuredStatList(container, structureKey, items, emptyText);
}

function rememberNetworkLargePayloadBuckets(buckets: GmNetworkBucket[]): void {
  statRememberNetworkLargePayloadBuckets(buckets, networkLargePayloadBucketByKey);
}

function renderNetworkLargePayloadSample(sample: NonNullable<GmNetworkBucket['largePayloadSamples']>[number], index: number): string {
  return statRenderNetworkLargePayloadSample(sample, index);
}

function closeNetworkPayloadModal(): void {
  statCloseNetworkPayloadModal();
}

function openNetworkPayloadModal(bucket: GmNetworkBucket): void {
  statOpenNetworkPayloadModal(bucket, setStatus);
}


/** getMemoryDomainMeta：读取Memory Domain元数据。 */
function getMemoryDomainMeta(totalRssBytes: number, domain: GmMemoryDomainEstimateSnapshot): string {
  return perfGetMemoryDomainMeta(totalRssBytes, domain);
}

function getMemoryInstanceMeta(totalRssBytes: number, instance: GmMemoryInstanceEstimateSnapshot): string {
  return perfGetMemoryInstanceMeta(totalRssBytes, instance);
}

function getHeapSpaceMeta(heapTotalBytes: number, space: GmV8HeapSpaceSnapshot): string {
  return perfGetHeapSpaceMeta(heapTotalBytes, space);
}

function getPathfindingFailureMeta(totalFailures: number, count: number): string {
  return perfGetPathfindingFailureMeta(totalFailures, count);
}
/** renderPerfLists：渲染性能Lists。 */
function renderPerfLists(data: GmStateRes): void {
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
  networkLargePayloadBucketByKey.clear();
  rememberNetworkLargePayloadBuckets(data.perf.networkInBuckets);
  rememberNetworkLargePayloadBuckets(data.perf.networkOutBuckets);
  const totalRssBytes = Math.max(0, data.perf.memoryEstimate?.rssBytes ?? 0);
  const memoryDomainItems = Array.isArray(data.perf.memoryEstimate?.domains)
    ? data.perf.memoryEstimate.domains.map((domain) => ({
        key: domain.key,
        label: domain.label,
        meta: getMemoryDomainMeta(totalRssBytes, domain),
      }))
    : [];
  const memoryInstanceItems = Array.isArray(data.perf.memoryEstimate?.topInstances)
    ? data.perf.memoryEstimate.topInstances.map((instance) => ({
        key: instance.instanceId,
        label: instance.label,
        meta: getMemoryInstanceMeta(totalRssBytes, instance),
      }))
    : [];
  const heapTotalBytes = Math.max(0, (data.perf.cpu.heapTotalMb ?? 0) * 1024 * 1024);
  const heapSpaceItems = Array.isArray(data.perf.memoryEstimate?.heapSpaces)
    ? data.perf.memoryEstimate.heapSpaces
        .slice()
        .sort((left, right) => right.usedBytes - left.usedBytes || left.name.localeCompare(right.name))
        .map((space) => ({
          key: space.name,
          label: space.name,
          meta: getHeapSpaceMeta(heapTotalBytes, space),
        }))
    : [];
  const totalFailures = data.perf.pathfinding.failed + data.perf.pathfinding.cancelled;
  const pathfindingFailureItems = data.perf.pathfinding.failureReasons.map((bucket) => ({
    key: bucket.reason,
    label: bucket.label,
    meta: getPathfindingFailureMeta(totalFailures, bucket.count),
  }));

  lastNetworkInStructureKey = perfRenderTrafficBreakdownList(
    summaryNetInBreakdownEl,
    lastNetworkInStructureKey,
    'in',
    data.perf.networkInBuckets,
    data.perf.networkInBytes,
    elapsedSec,
    '当前还没有累计上行事件。',
    currentTrafficBreakdownSort,
    currentTrafficBreakdownSortDirection,
    collapsedTrafficBreakdownGroupKeys,
  );
  lastNetworkOutStructureKey = perfRenderTrafficBreakdownList(
    summaryNetOutBreakdownEl,
    lastNetworkOutStructureKey,
    'out',
    data.perf.networkOutBuckets,
    data.perf.networkOutBytes,
    elapsedSec,
    '当前还没有累计下行事件。',
    currentTrafficBreakdownSort,
    currentTrafficBreakdownSortDirection,
    collapsedTrafficBreakdownGroupKeys,
  );
  lastCpuBreakdownStructureKey = perfRenderCpuBreakdownList(
    data,
    cpuBreakdownListEl,
    lastCpuBreakdownStructureKey,
    currentCpuBreakdownSort,
    currentCpuBreakdownSortDirection,
    collapsedCpuBreakdownGroupKeys,
  );
  lastMemoryDomainStructureKey = renderStructuredStatList(
    memoryDomainListEl,
    lastMemoryDomainStructureKey,
    memoryDomainItems,
    '当前还没有运行态内存画像。',
  );
  lastMemoryHeapSpaceStructureKey = renderStructuredStatList(
    memoryHeapSpaceListEl,
    lastMemoryHeapSpaceStructureKey,
    heapSpaceItems,
    '当前还没有 V8 heap space 数据。',
  );
  lastMemoryInstanceStructureKey = renderStructuredStatList(
    memoryInstanceListEl,
    lastMemoryInstanceStructureKey,
    memoryInstanceItems,
    '当前还没有实例内存画像。',
  );
  lastPathfindingFailureStructureKey = renderStructuredStatList(
    pathfindingFailureListEl,
    lastPathfindingFailureStructureKey,
    pathfindingFailureItems,
    '当前还没有寻路失败记录。',
  );
}

/** getEditorTabLabel：读取编辑器Tab标签。 */
function getEditorTabLabel(tab: GmEditorTab): string {
  return editorGetEditorTabLabel(tab);
}

/** switchEditorTab：处理switch编辑器Tab。 */
function switchEditorTab(tab: GmEditorTab): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** currentEditorTab：当前编辑器Tab。 */
  currentEditorTab = tab;
  editorTabBasicBtn.classList.toggle('active', tab === 'basic');
  editorTabPositionBtn.classList.toggle('active', tab === 'position');
  editorTabRealmBtn.classList.toggle('active', tab === 'realm');
  editorTabBuffsBtn.classList.toggle('active', tab === 'buffs');
  editorTabTechniquesBtn.classList.toggle('active', tab === 'techniques');
  editorTabCraftSkillsBtn.classList.toggle('active', tab === 'craftSkills');
  editorTabBenefitsBtn.classList.toggle('active', tab === 'benefits');
  editorTabShortcutsBtn.classList.toggle('active', tab === 'shortcuts');
  editorTabItemsBtn.classList.toggle('active', tab === 'items');
  editorTabQuestsBtn.classList.toggle('active', tab === 'quests');
  editorTabMailBtn.classList.toggle('active', tab === 'mail');
  editorTabRiskBtn.classList.toggle('active', tab === 'risk');
  editorTabPersistedBtn.classList.toggle('active', tab === 'persisted');
  editorVisualPanelEl.classList.toggle('hidden', tab === 'persisted');
  editorPersistedPanelEl.classList.toggle('hidden', tab !== 'persisted');
  editorContentEl.querySelectorAll<HTMLElement>('[data-editor-tab]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.editorTab !== tab);
  });
  if (tab === 'persisted') {
    savePlayerBtn.textContent = '数据库标签不直接保存';
  } else if (tab === 'mail') {
    savePlayerBtn.textContent = '邮件标签不直接保存';
  } else if (tab === 'risk') {
    savePlayerBtn.textContent = '风险标签不直接保存';
  } else if (tab === 'benefits') {
    savePlayerBtn.textContent = '权益标签按钮会直接提交';
  } else if (tab === 'shortcuts') {
    savePlayerBtn.textContent = '快捷标签按钮会直接提交';
  } else {
    savePlayerBtn.textContent = `保存${getEditorTabLabel(tab)}`;
  }
  if (tab === 'persisted') {
    const detail = getSelectedPlayerDetail();
    if (detail) {
      renderPlayerDatabasePanel(detail);
    }
  }
  savePlayerBtn.disabled = tab === 'persisted'
    || tab === 'mail'
    || tab === 'risk'
    || tab === 'benefits'
    || tab === 'shortcuts'
    || !selectedPlayerId
    || ((tab === 'buffs' || tab === 'techniques' || tab === 'items' || tab === 'quests') && !hasServerEditorCatalog());
}

/** StatusKind：分类枚举。 */
type StatusKind = 'idle' | 'pending' | 'success' | 'error';

/** applyStatusState：应用状态状态。 */
function applyStatusState(message: string, kind: StatusKind): void {
  statusBarEl.textContent = message;
  statusBarEl.dataset.kind = kind;
}

/** hideStatusToast：处理hide状态Toast。 */
function hideStatusToast(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (statusToastTimer !== null) {
    window.clearTimeout(statusToastTimer);
    /** statusToastTimer：状态Toast Timer。 */
    statusToastTimer = null;
  }
  statusToastEl.dataset.open = 'false';
  statusToastEl.dataset.kind = 'idle';
  statusToastEl.textContent = '';
}

/** showStatusToast：处理显示状态Toast。 */
function showStatusToast(message: string, kind: Exclude<StatusKind, 'idle'>): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!message) {
    hideStatusToast();
    return;
  }
  if (statusToastTimer !== null) {
    window.clearTimeout(statusToastTimer);
    /** statusToastTimer：状态Toast Timer。 */
    statusToastTimer = null;
  }
  statusToastEl.textContent = message;
  statusToastEl.dataset.kind = kind;
  statusToastEl.dataset.open = 'true';
  if (kind === 'pending') {
    return;
  }
  statusToastTimer = window.setTimeout(() => {
    statusToastEl.dataset.open = 'false';
  }, kind === 'error' ? 5200 : 2800);
}

/** setPendingStatus：处理set待处理状态。 */
function setPendingStatus(message: string): void {
  applyStatusState(message, message ? 'pending' : 'idle');
  showStatusToast(message, 'pending');
}

/** setStatus：处理set状态。 */
function setStatus(message: string, isError = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const kind: StatusKind = !message ? 'idle' : isError ? 'error' : 'success';
  applyStatusState(message, kind);
  if (kind === 'idle') {
    hideStatusToast();
    return;
  }
  showStatusToast(message, kind);
}

/** worldViewer：世界Viewer。 */
const worldViewer = new GmWorldViewer(request, setStatus);

generatedTechniqueEditor = createGmCustomTechniqueEditor({
  apiBasePath: GM_API_BASE_PATH,
  form: customTechniqueFormEl,
  internalFields: customTechniqueInternalFieldsEl,
  artsFields: customTechniqueArtsFieldsEl,
  budgetOutput: customTechniqueBudgetOutputEl,
  detailEmpty: generatedTechniqueDetailEmptyEl,
  detail: generatedTechniqueDetailEl,
  detailMeta: generatedTechniqueDetailMetaEl,
  detailJson: generatedTechniqueJsonEl,
  request,
  setStatus,
  onCreated: async (techniqueId) => {
    currentGeneratedTechniqueSubtab = 'techniques';
    applyGeneratedTechniqueSubtabVisibility('techniques');
    await loadGeneratedTechniques(false);
    await loadGeneratedTechniqueDetail(techniqueId);
  },
});

function applyServerTabVisibility(tab: GmServerTab): void {
  serverSubtabOverviewBtn.classList.toggle('active', tab === 'overview');
  serverSubtabTrafficBtn.classList.toggle('active', tab === 'traffic');
  serverSubtabCpuBtn.classList.toggle('active', tab === 'cpu');
  serverSubtabMemoryBtn.classList.toggle('active', tab === 'memory');
  serverSubtabDatabaseBtn.classList.toggle('active', tab === 'database');
  serverSubtabLogsBtn.classList.toggle('active', tab === 'logs');
  serverSubtabWorkersBtn.classList.toggle('active', tab === 'workers');
  serverSubtabEnvCheckBtn.classList.toggle('active', tab === 'envCheck');
  serverSubtabObjectsBtn.classList.toggle('active', tab === 'objects');
  serverPanelOverviewEl.classList.toggle('hidden', tab !== 'overview');
  serverPanelTrafficEl.classList.toggle('hidden', tab !== 'traffic');
  serverPanelCpuEl.classList.toggle('hidden', tab !== 'cpu');
  serverPanelMemoryEl.classList.toggle('hidden', tab !== 'memory');
  serverPanelDatabaseEl.classList.toggle('hidden', tab !== 'database');
  serverPanelLogsEl.classList.toggle('hidden', tab !== 'logs');
  serverPanelWorkersEl.classList.toggle('hidden', tab !== 'workers');
  serverPanelEnvCheckEl.classList.toggle('hidden', tab !== 'envCheck');
  serverPanelObjectsEl.classList.toggle('hidden', tab !== 'objects');
}

/** switchServerTab：处理switch服务端Tab。 */
function switchServerTab(tab: GmServerTab): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** currentServerTab：当前服务端Tab。 */
  currentServerTab = tab;
  applyServerTabVisibility(tab);
  if (tab === 'database' && !databaseStateLoading) {
    loadDatabaseState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载数据库状态失败', true);
    });
  }
  if (tab === 'logs' && serverLogsEntries.length === 0 && !serverLogsLoading) {
    loadServerLogs(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载服务端日志失败', true);
    });
  }
  if (tab === 'workers' && !workerState && !workerStateLoading) {
    loadWorkerState(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载 worker 状态失败', true);
    });
  }
  if (tab === 'envCheck' && !envCheckResult && !envCheckLoading) {
    loadEnvCheck(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '环境检测失败', true);
    });
  }
  if (tab === 'traffic') {
    ensureNetworkStatsActive().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '启动流量统计失败', true);
    });
  }
  if (tab === 'memory') {
    loadState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载内存画像失败', true);
    });
  }
  if (tab === 'objects' && !objectsLoading) {
    loadObjectCounts().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载对象信息失败', true);
    });
  }
}

/** serverLogsPanelContext：server-logs-panel 对 gm.ts 的依赖。 */
const serverLogsPanelContext: ServerLogsPanelContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  setStatus,
  escapeHtml,
  formatDateTime,
  buildGmServerLogsApiPath,
  getServerLogsLoading: () => serverLogsLoading,
  setServerLogsLoading: (loading) => { serverLogsLoading = loading; },
  getServerLogsEntries: () => serverLogsEntries,
  setServerLogsEntries: (entries) => { serverLogsEntries = entries; },
  getServerLogsNextBeforeSeq: () => serverLogsNextBeforeSeq,
  setServerLogsNextBeforeSeq: (seq) => { serverLogsNextBeforeSeq = seq; },
  getServerLogsHasMore: () => serverLogsHasMore,
  setServerLogsHasMore: (hasMore) => { serverLogsHasMore = hasMore; },
  getServerLogsBufferSize: () => serverLogsBufferSize,
  setServerLogsBufferSize: (size) => { serverLogsBufferSize = size; },
  serverLogsContentEl,
  serverLogsMetaEl,
  serverLogsLoadOlderBtn,
  serverLogsRefreshBtn,
};

function formatServerLogLine(entry: GmServerLogEntry): string { return serverLogsPanelFormatServerLogLine(entry, serverLogsPanelContext); }
function renderServerLogsPanel(): void { return serverLogsPanelRenderServerLogsPanel(serverLogsPanelContext); }
async function loadServerLogs(loadOlder: boolean): Promise<void> { return serverLogsPanelLoadServerLogs(loadOlder, serverLogsPanelContext); }

/** diagPanelContext：diagnostics-panel 对 gm.ts 的依赖。 */
const diagPanelContext: DiagnosticsPanelContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  setStatus,
  escapeHtml,
  formatDateTime,
  getDiagHistoryIndex: () => diagHistoryIndex,
  setDiagHistoryIndex: (index) => { diagHistoryIndex = index; },
  getServerDiagnosticsLoading: () => serverDiagnosticsLoading,
  setServerDiagnosticsLoading: (loading) => { serverDiagnosticsLoading = loading; },
  getLastServerDiagnosticsResult: () => lastServerDiagnosticsResult,
  setLastServerDiagnosticsResult: (result) => { lastServerDiagnosticsResult = result; },
  getLastExecCommand: () => lastExecCommand,
  setLastExecCommand: (command) => { lastExecCommand = command; },
  getLastExecPreviousCommand: () => lastExecPreviousCommand,
  setLastExecPreviousCommand: (command) => { lastExecPreviousCommand = command; },
  getDiagCommandEl,
  getDiagLimitEl,
  getDiagRunBtn,
  getDiagHelpBtn,
  getDiagMetaEl,
  getDiagOutputEl,
  getDiagUndoBtn,
};

let diagHistoryIndex = -1;

function diagHistoryLoad(): string[] { return diagPanelDiagHistoryLoad(diagPanelContext); }
function diagHistoryPush(command: string): void { return diagPanelDiagHistoryPush(command, diagPanelContext); }
function diagHistoryNavigate(direction: 'up' | 'down'): string | null { return diagPanelDiagHistoryNavigate(direction, diagPanelContext); }
function renderDiagnosticsPanel(): void { return diagPanelRenderDiagnosticsPanel(diagPanelContext); }
function updateUndoButton(): void { return diagPanelUpdateUndoButton(diagPanelContext); }
function renderDiagnosticsResultAsTable(result: GmDiagnosticsQueryRes): string { return diagPanelRenderDiagnosticsResultAsTable(result, diagPanelContext); }
function renderResultSetTable(resultSet: GmDiagnosticsResultSet): string { return diagPanelRenderResultSetTable(resultSet, diagPanelContext); }
function renderTableCell(value: unknown, col: string): string { return diagPanelRenderTableCell(value, col, diagPanelContext); }
function diagPlayerHistoryLoad(): string[] { return diagPanelDiagPlayerHistoryLoad(diagPanelContext); }
function diagPlayerHistorySave(value: string): void { return diagPanelDiagPlayerHistorySave(value, diagPanelContext); }
function showDiagPrompt(title: string): Promise<string | null> { return diagPanelShowDiagPrompt(title, diagPanelContext); }
function startDiagCellEdit(td: HTMLTableCellElement): void { return diagPanelStartDiagCellEdit(td, diagPanelContext); }
function inferTableName(title: string): string { return diagPanelInferTableName(title, diagPanelContext); }
function buildWhereFromRow(tr: HTMLElement, excludeCol: string): string { return diagPanelBuildWhereFromRow(tr, excludeCol, diagPanelContext); }
async function runDiagnosticsCommand(command: string): Promise<void> { return diagPanelRunDiagnosticsCommand(command, diagPanelContext); }

/** workerHelpersContext：worker-helpers 对 gm.ts 的依赖。 */
const workerHelpersContext: WorkerHelpersContext = {
  escapeHtml,
  formatDateTime,
};

/** serverPanelsExtraContext：server-panels-extra 对 gm.ts 的依赖。 */
const serverPanelsExtraContext: ServerPanelsExtraContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  setStatus,
  setPendingStatus,
  escapeHtml,
  formatDateTime,
  NETWORK_PAYLOAD_CAPTURE_FLAG_KEY,
  getWorkerState: () => workerState,
  setWorkerState: (state) => { workerState = state; },
  getWorkerStateLoading: () => workerStateLoading,
  setWorkerStateLoading: (loading) => { workerStateLoading = loading; },
  getEnvCheckResult: () => envCheckResult,
  setEnvCheckResult: (result) => { envCheckResult = result; },
  getEnvCheckLoading: () => envCheckLoading,
  setEnvCheckLoading: (loading) => { envCheckLoading = loading; },
  getRuntimeFlags: () => runtimeFlags,
  setRuntimeFlags: (flags) => { runtimeFlags = flags; },
  getRuntimeFlagsLoading: () => runtimeFlagsLoading,
  setRuntimeFlagsLoading: (loading) => { runtimeFlagsLoading = loading; },
  getObjectsLoading: () => objectsLoading,
  setObjectsLoading: (loading) => { objectsLoading = loading; },
  getObjectCountsData: () => objectCountsData,
  setObjectCountsData: (data) => { objectCountsData = data; },
  loadState,
  renderSummary,
  renderGameConfig,
  getState: () => state,
  setState: (newState) => { state = newState as typeof state; },
  restartServerBtn,
  serverEnvCheckContentEl,
  serverEnvCheckMetaEl,
  serverEnvCheckRefreshBtn,
  serverObjectsContentEl,
  serverObjectsMetaEl,
  serverObjectsRefreshBtn,
  serverWorkersContentEl,
  serverWorkersMetaEl,
  serverWorkersRefreshBtn,
  toggleMaintenanceModeBtn,
  workerHelpersContext,
};

function renderWorkerPoolSection(wp: any): void { return serverPanelsExtraRenderWorkerPoolSection(wp, serverPanelsExtraContext); }
function renderWorkerPanel(): void { return serverPanelsExtraRenderWorkerPanel(serverPanelsExtraContext); }
async function loadWorkerState(silent = false): Promise<void> { return serverPanelsExtraLoadWorkerState(silent, serverPanelsExtraContext); }
function getEnvCheckStatusText(status: GmEnvCheckResult['groups'][number]['items'][number]['status']): string { return serverPanelsExtraGetEnvCheckStatusText(status, serverPanelsExtraContext); }
function getEnvCheckStatusIcon(status: GmEnvCheckResult['groups'][number]['items'][number]['status']): string { return serverPanelsExtraGetEnvCheckStatusIcon(status, serverPanelsExtraContext); }
function renderEnvCheckPanel(): void { return serverPanelsExtraRenderEnvCheckPanel(serverPanelsExtraContext); }
async function loadEnvCheck(silent = false): Promise<void> { return serverPanelsExtraLoadEnvCheck(silent, serverPanelsExtraContext); }
async function loadRuntimeFlags(): Promise<void> { return serverPanelsExtraLoadRuntimeFlags(serverPanelsExtraContext); }
async function toggleRuntimeFlag(key: string, value: boolean): Promise<void> { return serverPanelsExtraToggleRuntimeFlag(key, value, serverPanelsExtraContext); }
async function addRuntimeFlag(key: string): Promise<void> { return serverPanelsExtraAddRuntimeFlag(key, serverPanelsExtraContext); }
async function deleteRuntimeFlag(key: string): Promise<void> { return serverPanelsExtraDeleteRuntimeFlag(key, serverPanelsExtraContext); }
async function setMaintenanceMode(active: boolean): Promise<void> { return serverPanelsExtraSetMaintenanceMode(active, serverPanelsExtraContext); }
async function restartServer(): Promise<void> { return serverPanelsExtraRestartServer(serverPanelsExtraContext); }
function renderRuntimeFlagsPanel(): void { return serverPanelsExtraRenderRuntimeFlagsPanel(serverPanelsExtraContext); }
function buildRuntimeFlagsHtml(): string { return serverPanelsExtraBuildRuntimeFlagsHtml(serverPanelsExtraContext); }
function bindRuntimeFlagsEvents(container: HTMLElement): void { return serverPanelsExtraBindRuntimeFlagsEvents(container, serverPanelsExtraContext); }
function renderObjectsPanel(): void { return serverPanelsExtraRenderObjectsPanel(serverPanelsExtraContext); }
async function loadObjectCounts(): Promise<void> { return serverPanelsExtraLoadObjectCounts(serverPanelsExtraContext); }


function getWorkerRowMarkup(row: GmWorkerRow): string { return workerHelpersGetWorkerRowMarkup(row, workerHelpersContext); }
function getWorkerWindowMetricLabel(row: GmWorkerRow): string { return workerHelpersGetWorkerWindowMetricLabel(row, workerHelpersContext); }
function getWorkerStatusLabel(status: GmWorkerRow['status']): string { return workerHelpersGetWorkerStatusLabel(status, workerHelpersContext); }
function getWorkerTopologyMarkup(state: GmWorkerStateRes): string { return workerHelpersGetWorkerTopologyMarkup(state, workerHelpersContext); }
function getWorkerSchedulerMarkup(state: GmWorkerStateRes): string { return workerHelpersGetWorkerSchedulerMarkup(state, workerHelpersContext); }
function getWorkerAlertLabel(reason: string): string { return workerHelpersGetWorkerAlertLabel(reason, workerHelpersContext); }
function getSchedulerDiagnosticNote(state: GmWorkerStateRes): string { return workerHelpersGetSchedulerDiagnosticNote(state, workerHelpersContext); }
function getAlertInactiveDiagnostic(state: GmWorkerStateRes, workerId: string): string { return workerHelpersGetAlertInactiveDiagnostic(state, workerId, workerHelpersContext); }
function getWorkerCapacityMarkup(state: GmWorkerStateRes): string { return workerHelpersGetWorkerCapacityMarkup(state, workerHelpersContext); }
function formatWorkerFailureBreakdown(byCategory: Record<string, number>): string { return workerHelpersFormatWorkerFailureBreakdown(byCategory, workerHelpersContext); }
function formatMs(value: number): string { return workerHelpersFormatMs(value, workerHelpersContext); }
function formatCompactNumber(value: number): string { return workerHelpersFormatCompactNumber(value, workerHelpersContext); }
function formatWorkerRate(value: number): string { return workerHelpersFormatWorkerRate(value, workerHelpersContext); }
function countWorkerRows(rows: GmWorkerRow[], statuses: GmWorkerRow['status'][]): number { return workerHelpersCountWorkerRows(rows, statuses, workerHelpersContext); }
function sumWorkerRows(rows: GmWorkerRow[], key: 'pendingCount' | 'deadLetterCount'): number { return workerHelpersSumWorkerRows(rows, key, workerHelpersContext); }
function formatDatabaseBackupKind(kind: GmDatabaseBackupRecord['kind']): string { return workerHelpersFormatDatabaseBackupKind(kind, workerHelpersContext); }
function formatDatabaseBackupFormat(format: GmDatabaseBackupRecord['format']): string { return workerHelpersFormatDatabaseBackupFormat(format, workerHelpersContext); }

function renderCommandsContent(): string {
  const metaText = serverDiagnosticsLoading ? '查询执行中…' : (lastServerDiagnosticsResult
    ? `${lastServerDiagnosticsResult.ok ? '成功' : '失败'} · ${formatDateTime(lastServerDiagnosticsResult.executedAt)} · ${lastServerDiagnosticsResult.durationMs} ms`
    : '查询尚未执行。');
  const outputHtml = lastServerDiagnosticsResult
    ? renderDiagnosticsResultAsTable(lastServerDiagnosticsResult)
    : '<pre class="server-log-view">可输入 help 查看可用指令。</pre>';
  return `
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">数据库查询与操作</div>
        <div class="network-breakdown-subtitle">支持 help 查看全部指令；只读查询自动 READ ONLY，写操作需勾选确认。</div>
      </div>
      <div class="diagnostics-shortcuts" id="diagnostics-shortcuts">
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">玩家</span>
          <button type="button" class="diag-btn" data-diag-cmd="presence">在线列表</button>
          <button type="button" class="diag-btn" data-diag-cmd="presence all">全量状态</button>
          <button type="button" class="diag-btn" data-diag-cmd="player " data-diag-prompt="player_id / username / 角色名 / 序号">查玩家</button>
          <button type="button" class="diag-btn" data-diag-cmd="inventory " data-diag-prompt="player_id / 角色名">背包</button>
          <button type="button" class="diag-btn" data-diag-cmd="equipment " data-diag-prompt="player_id / 角色名">装备</button>
          <button type="button" class="diag-btn" data-diag-cmd="techniques " data-diag-prompt="player_id / 角色名">功法</button>
          <button type="button" class="diag-btn" data-diag-cmd="quests " data-diag-prompt="player_id / 角色名">任务</button>
          <button type="button" class="diag-btn" data-diag-cmd="buffs " data-diag-prompt="player_id / 角色名">Buff</button>
          <button type="button" class="diag-btn" data-diag-cmd="wallet " data-diag-prompt="player_id / 角色名">钱包</button>
          <button type="button" class="diag-btn" data-diag-cmd="counters " data-diag-prompt="player_id / 角色名">计数器</button>
          <button type="button" class="diag-btn" data-diag-cmd="mail " data-diag-prompt="player_id / 角色名">邮件</button>
          <button type="button" class="diag-btn" data-diag-cmd="audit " data-diag-prompt="player_id / 角色名">审计</button>
        </div>
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">世界</span>
          <button type="button" class="diag-btn" data-diag-cmd="instances">实例摘要</button>
          <button type="button" class="diag-btn" data-diag-cmd="instances active">活跃实例</button>
          <button type="button" class="diag-btn" data-diag-cmd="market">市场挂单</button>
          <button type="button" class="diag-btn" data-diag-cmd="trades">最近成交</button>
        </div>
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">运维</span>
          <button type="button" class="diag-btn" data-diag-cmd="outbox">Outbox</button>
          <button type="button" class="diag-btn" data-diag-cmd="flush">脏数据队列</button>
          <button type="button" class="diag-btn" data-diag-cmd="deadletter">死信</button>
          <button type="button" class="diag-btn" data-diag-cmd="tables">表大小</button>
        </div>
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">数据库</span>
          <button type="button" class="diag-btn" data-diag-cmd="dbsize">DB 大小</button>
          <button type="button" class="diag-btn" data-diag-cmd="connections">连接数</button>
          <button type="button" class="diag-btn" data-diag-cmd="locks">锁等待</button>
          <button type="button" class="diag-btn" data-diag-cmd="slowqueries">慢查询</button>
          <button type="button" class="diag-btn" data-diag-cmd="replication">复制状态</button>
        </div>
      </div>
      <div class="server-log-toolbar">
        <textarea id="server-diagnostics-command" rows="3" placeholder="输入命令或点击上方快捷按钮，Ctrl+Enter 执行，↑↓ 切换历史&#10;写操作示例：exec UPDATE player_wallet SET balance = 1000 WHERE player_id = 'xxx'" style="width:100%; min-height:68px; resize:vertical;"></textarea>
      </div>
      <div class="server-log-toolbar">
        <input id="server-diagnostics-limit" type="number" min="1" max="200" value="50" style="width:90px;" />
        <button id="server-diagnostics-run" class="small-btn primary" type="button">执行</button>
        <button id="server-diagnostics-help" class="small-btn" type="button">帮助</button>
        <button id="server-diagnostics-undo" class="small-btn" type="button" disabled>撤回</button>
        <div id="server-diagnostics-meta" class="server-log-meta">${escapeHtml(metaText)}</div>
      </div>
      <div id="server-diagnostics-output" class="diagnostics-output-container">${outputHtml}</div>
    </div>
  `;
}

/** renderDatabasePanel：渲染数据库面板。 */
function renderDatabasePanel(force = false): void {
  // 指令子 tab：如果 DOM 已存在且非强制刷新，跳过重绘以保留 textarea 内容和查询结果
  if (databaseSubTab === 'commands' && !force && getDiagCommandEl()) {
    return;
  }

  const subTabBar = `
    <div class="button-row">
      <button class="small-btn ${databaseSubTab === 'commands' ? 'primary' : ''}" data-db-subtab="commands" type="button">指令</button>
      <button class="small-btn ${databaseSubTab === 'backup' ? 'primary' : ''}" data-db-subtab="backup" type="button">备份管理</button>
      <button class="small-btn ${databaseSubTab === 'table-stats' ? 'primary' : ''}" data-db-subtab="table-stats" type="button">表占用分析</button>
    </div>
  `;

  if (databaseSubTab === 'commands') {
    serverPanelDatabaseEl.innerHTML = subTabBar + renderCommandsContent();
    renderDiagnosticsPanel();
    return;
  }

  if (databaseSubTab === 'table-stats') {
    serverPanelDatabaseEl.innerHTML = subTabBar + renderTableStatsContent();
    return;
  }

  const busy = databaseState?.runningJob?.status === 'running' || databaseImportBusy;
  const backups = databaseState?.backups ?? [];
  const importStatus = databaseImportStatus
    ? databaseImportStatus
    : '只接受新版 PostgreSQL 自定义备份（.dump 或 .dump.gz）。上传后会进入下方备份列表；选择"上传并导入"会继续走同一套数据库恢复流程。';
  const rows = databasePanelRenderBackupListHtml(backups, busy, formatDatabaseBackupKind, formatDatabaseBackupFormat, formatDateTime);

  serverPanelDatabaseEl.innerHTML = subTabBar + `
    <div class="button-row">
      <button id="database-refresh" class="small-btn" type="button">刷新持久化状态</button>
      <button id="database-export-current" class="small-btn primary" type="button" ${busy ? 'disabled' : ''}>导出数据库备份</button>
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">导入本地数据库备份</div>
        <div class="network-breakdown-subtitle">上传新版 PostgreSQL 自定义备份，登记到当前 GM 备份目录；可直接执行恢复</div>
      </div>
      <div class="filter-row" style="margin-top: 10px;">
        <span id="database-import-file-slot"></span>
        <button id="database-upload-backup" class="small-btn" type="button" ${busy ? 'disabled' : ''}>上传到备份列表</button>
        <button id="database-upload-and-restore" class="small-btn danger" type="button" ${busy ? 'disabled' : ''}>上传并导入</button>
      </div>
      <div id="database-import-status" class="editor-note" style="margin-top:8px;">${escapeHtml(importStatus)}</div>
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">历史持久化备份</div>
        <div class="network-breakdown-subtitle">支持下载任意历史备份，也支持把某份备份重新恢复到当前主线数据库</div>
      </div>
      <div class="network-breakdown-list">${rows}</div>
    </div>
  `;

  // 将持久化的 file input 插入占位容器，保证节点不被销毁、change 事件始终有效
  const slot = serverPanelDatabaseEl.querySelector<HTMLSpanElement>('#database-import-file-slot');
  if (slot) {
    persistentFileInput.disabled = busy;
    slot.replaceWith(persistentFileInput);
  }
}

function renderTableStatsContent(): string {
  return databasePanelRenderTableStatsContentHtml(tableStatsLoading, tableStatsState, cleanupBusy, formatDateTime);
}

async function loadTableStats(): Promise<void> {
  if (!token) return;
  tableStatsLoading = true;
  renderDatabasePanel();
  try {
    tableStatsState = await request<GmDatabaseTableStatsRes>(`${GM_API_BASE_PATH}/database/table-stats`);
    setStatus('表占用统计已加载');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '加载表占用统计失败', true);
  } finally {
    tableStatsLoading = false;
    renderDatabasePanel();
  }
}

async function cleanupTable(target: string, mode: GmDatabaseCleanupReq['mode'] = 'older_than'): Promise<void> {
  if (!token || cleanupBusy) return;
  cleanupBusy = true;
  renderDatabasePanel();
  try {
    const requestBody: GmDatabaseCleanupReq = {
      ...(mode === 'all'
        ? { target, mode }
        : { target, mode: 'older_than' as const, olderThanDays: 7 }),
      confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_PHRASES.databaseCleanup,
    };
    const result = await request<GmDatabaseCleanupRes>(`${GM_API_BASE_PATH}/database/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    setStatus(result.message);
    await loadTableStats();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '清理失败', true);
  } finally {
    cleanupBusy = false;
    renderDatabasePanel();
  }
}

/** renderRedeemPanel：渲染兑换面板。 */
const redeemPanelDeps: RedeemPanelDeps = {
  getMailAttachmentTitle,
  getMailAttachmentRowMeta,
  searchableItemField,
  getRedeemCodeMarkup,
  formatDateTime,
};

function renderRedeemPanel(): void {
  if (!redeemGroupListEl || !redeemGroupEditorEl || !redeemCodeListEl) {
    return;
  }

  const selectedGroupId = selectedRedeemGroupId;
  redeemStatusEl && (redeemStatusEl.textContent = redeemLoading ? '正在同步兑换码数据…' : (redeemLatestGeneratedCodes.length > 0 ? `最近生成 ${redeemLatestGeneratedCodes.length} 个兑换码` : '兑换码变更会直接写数据库，但数据库备份不会包含兑换码表。'));

  redeemGroupListEl.innerHTML = redeemPanelRenderRedeemGroupListHtml(redeemGroupsState, selectedGroupId);

  redeemGroupEditorEl.innerHTML = redeemPanelRenderRedeemGroupEditorHtml(redeemDraft, redeemGroupDetailState, selectedGroupId, redeemLatestGeneratedCodes, redeemPanelDeps);
  syncSearchableItemFields(redeemGroupEditorEl);

  redeemCodeListEl.innerHTML = redeemPanelRenderRedeemCodeListHtml(redeemGroupDetailState, redeemPanelDeps);
}

/** getRedeemCodeMarkup：读取兑换兑换码Markup。 */
function getRedeemCodeMarkup(code: RedeemCodeCodeView): string {
  return gmMarkupHelpers.getRedeemCodeMarkup(code, formatDateTime);
}

/** copyTextToClipboard：复制文本To Clipboard。 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 某些浏览器或非安全上下文会拒绝 Clipboard API，此时回退到 execCommand。
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

/** copyActiveRedeemCodes：复制活跃兑换兑换码。 */
async function copyActiveRedeemCodes(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const group = redeemGroupDetailState?.group;
  const activeCodes = (redeemGroupDetailState?.codes ?? [])
    .filter((code) => code.status === 'active')
    .map((code) => code.code.trim())
    .filter((code) => code.length > 0);
  if (activeCodes.length === 0) {
    setStatus(t('gm.redeem.active-empty'), true);
    return;
  }
  const copied = await copyTextToClipboard(activeCodes.join('\n'));
  if (!copied) {
    setStatus(t('gm.redeem.copy-failed'), true);
    return;
  }
  setStatus(group
    ? t('gm.redeem.copied-with-group', { count: activeCodes.length, groupName: group.name })
    : t('gm.redeem.copied', { count: activeCodes.length }));
}

/** getRedeemCodeStatusLabel：读取兑换兑换码状态标签。 */
function getRedeemCodeStatusLabel(status: RedeemCodeCodeView['status']): string {
  return gmMarkupHelpers.getRedeemCodeStatusLabel(status);
}

/** buildRedeemGroupPayload：构建兑换分组载荷。 */
function buildRedeemGroupPayload(): {
/**
 * name：名称名称或显示文本。
 */
 name: string;
 /**
 * rewards：reward相关字段。
 */
 rewards: RedeemCodeGroupRewardItem[] } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const name = redeemDraft.name.trim();
  const rewards = redeemDraft.rewards
    .filter((entry) => entry.itemId.trim().length > 0 && Number.isFinite(entry.count) && entry.count > 0)
    .map((entry) => ({
      itemId: entry.itemId.trim(),
      count: Math.max(1, Math.floor(entry.count)),
    }));
  if (!name) {
    throw new Error(t('gm.redeem.group-name-empty'));
  }
  if (rewards.length === 0) {
    throw new Error(t('gm.redeem.reward-empty'));
  }
  return { name, rewards };
}

/** redeemDbPanelContext：redeem-database-panel 对 gm.ts 的依赖。 */
const redeemDbPanelContext: RedeemDatabasePanelContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  requestBlob,
  setStatus,
  t,
  formatBytes,
  confirm,
  buildGmDatabaseBackupDownloadApiPath,
  buildRedeemGroupPayload,
  createDefaultRedeemGroupDraft,
  renderRedeemPanel,
  renderDatabasePanel,
  getRedeemLoading: () => redeemLoading,
  setRedeemLoading: (loading) => { redeemLoading = loading; },
  getRedeemLatestGeneratedCodes: () => redeemLatestGeneratedCodes,
  setRedeemLatestGeneratedCodes: (codes) => { redeemLatestGeneratedCodes = codes; },
  getRedeemGroupsState: () => redeemGroupsState,
  setRedeemGroupsState: (groups) => { redeemGroupsState = groups; },
  getSelectedRedeemGroupId: () => selectedRedeemGroupId,
  setSelectedRedeemGroupId: (id) => { selectedRedeemGroupId = id; },
  getRedeemGroupDetailState: () => redeemGroupDetailState,
  setRedeemGroupDetailState: (detail) => { redeemGroupDetailState = detail; },
  getRedeemDraft: () => redeemDraft,
  setRedeemDraft: (draft) => { redeemDraft = draft; },
  getDatabaseState: () => databaseState,
  setDatabaseState: (newState) => { databaseState = newState; },
  getDatabaseStateLoading: () => databaseStateLoading,
  setDatabaseStateLoading: (loading) => { databaseStateLoading = loading; },
  getDatabaseImportBusy: () => databaseImportBusy,
  setDatabaseImportBusy: (busy) => { databaseImportBusy = busy; },
  getDatabaseImportStatus: () => databaseImportStatus,
  setDatabaseImportStatus: (status) => { databaseImportStatus = status; },
  getSelectedDatabaseImportFile: () => selectedDatabaseImportFile,
  setSelectedDatabaseImportFile: (file) => { selectedDatabaseImportFile = file; },
  persistentFileInput,
  serverPanelDatabaseEl,
};

async function loadRedeemGroups(silent = false): Promise<void> { return redeemDbPanelLoadRedeemGroups(silent, redeemDbPanelContext); }
async function loadRedeemGroupDetail(groupId: string, silent = false): Promise<void> { return redeemDbPanelLoadRedeemGroupDetail(groupId, silent, redeemDbPanelContext); }
async function createRedeemGroup(): Promise<void> { return redeemDbPanelCreateRedeemGroup(redeemDbPanelContext); }
async function saveRedeemGroup(): Promise<void> { return redeemDbPanelSaveRedeemGroup(redeemDbPanelContext); }
async function deleteRedeemGroup(): Promise<void> { return redeemDbPanelDeleteRedeemGroup(redeemDbPanelContext); }
async function appendRedeemCodes(): Promise<void> { return redeemDbPanelAppendRedeemCodes(redeemDbPanelContext); }
async function destroyRedeemCode(codeId: string): Promise<void> { return redeemDbPanelDestroyRedeemCode(codeId, redeemDbPanelContext); }
async function loadDatabaseState(silent = false): Promise<void> { return redeemDbPanelLoadDatabaseState(silent, redeemDbPanelContext); }
async function exportCurrentDatabase(): Promise<void> { return redeemDbPanelExportCurrentDatabase(redeemDbPanelContext); }
function getSelectedDatabaseImportFile(): File | null { return redeemDbPanelGetSelectedDatabaseImportFile(redeemDbPanelContext); }
function patchDatabaseImportStatus(message: string): void { return redeemDbPanelPatchDatabaseImportStatus(message, redeemDbPanelContext); }
function isSupportedDatabaseImportFile(file: File): boolean { return redeemDbPanelIsSupportedDatabaseImportFile(file, redeemDbPanelContext); }
function updateDatabaseImportFileSelection(file: File | null): void { return redeemDbPanelUpdateDatabaseImportFileSelection(file, redeemDbPanelContext); }
async function uploadDatabaseBackupFile(restoreAfterUpload: boolean): Promise<void> { return redeemDbPanelUploadDatabaseBackupFile(restoreAfterUpload, redeemDbPanelContext); }
function getDownloadFileName(response: Response, fallback: string): string { return redeemDbPanelGetDownloadFileName(response, fallback, redeemDbPanelContext); }
async function downloadDatabaseBackup(backupId: string): Promise<void> { return redeemDbPanelDownloadDatabaseBackup(backupId, redeemDbPanelContext); }
async function restoreDatabaseBackup(backupId: string, options?: { skipConfirm?: boolean; fallbackFileName?: string; expectedChecksum?: string }): Promise<void> { return redeemDbPanelRestoreDatabaseBackup(backupId, options ?? {}, redeemDbPanelContext); }

function setCpuBreakdownSort(sort: CpuBreakdownSortMode): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (currentCpuBreakdownSort === sort) {
    currentCpuBreakdownSortDirection = currentCpuBreakdownSortDirection === 'desc' ? 'asc' : 'desc';
  } else {
    currentCpuBreakdownSortDirection = 'desc';
  }
  currentCpuBreakdownSort = sort;
  if (state) {
    lastCpuBreakdownStructureKey = null;
    renderPerfLists(state);
  }
}

function setTrafficBreakdownSort(sort: TrafficBreakdownSortMode): void {
  if (currentTrafficBreakdownSort === sort) {
    currentTrafficBreakdownSortDirection = currentTrafficBreakdownSortDirection === 'desc' ? 'asc' : 'desc';
  } else {
    currentTrafficBreakdownSortDirection = 'desc';
  }
  currentTrafficBreakdownSort = sort;
  if (state) {
    lastNetworkInStructureKey = null;
    lastNetworkOutStructureKey = null;
    renderPerfLists(state);
  }
}

function toggleTrafficBreakdownGroup(groupKey: string): void {
  if (collapsedTrafficBreakdownGroupKeys.has(groupKey)) {
    collapsedTrafficBreakdownGroupKeys.delete(groupKey);
  } else {
    collapsedTrafficBreakdownGroupKeys.add(groupKey);
  }
  if (state) {
    lastNetworkInStructureKey = null;
    lastNetworkOutStructureKey = null;
    renderPerfLists(state);
  }
}

function toggleCpuBreakdownGroup(groupKey: string): void {
  if (collapsedCpuBreakdownGroupKeys.has(groupKey)) {
    collapsedCpuBreakdownGroupKeys.delete(groupKey);
  } else {
    collapsedCpuBreakdownGroupKeys.add(groupKey);
  }
  if (state) {
    lastCpuBreakdownStructureKey = null;
    renderPerfLists(state);
  }
}

/** switchTab：处理switch Tab。 */
function switchTab(tab: GmMainTab): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  // 离开世界管理时停止轮询
  if (currentTab === 'world' && tab !== 'world') {
    worldViewer.stopPolling();
  }
  /** currentTab：当前Tab。 */
  currentTab = tab;
  serverTabBtn.classList.toggle('active', tab === 'server');
  redeemTabBtn.classList.toggle('active', tab === 'redeem');
  playerTabBtn.classList.toggle('active', tab === 'players');
  worldTabBtn.classList.toggle('active', tab === 'world');
  shortcutTabBtn.classList.toggle('active', tab === 'shortcuts');
  envTabBtn.classList.toggle('active', tab === 'secrets');
  gameConfigTabBtn.classList.toggle('active', tab === 'gameconfig');
  aiTabBtn.classList.toggle('active', tab === 'ai');
  generatedTechniqueTabBtn.classList.toggle('active', tab === 'generatedTechniques');
  tradesTabBtn.classList.toggle('active', tab === 'trades');
  serverWorkspaceEl.classList.toggle('hidden', tab !== 'server');
  redeemWorkspaceEl.classList.toggle('hidden', tab !== 'redeem');
  playerWorkspaceEl.classList.toggle('hidden', tab !== 'players');
  worldWorkspaceEl.classList.toggle('hidden', tab !== 'world');
  shortcutWorkspaceEl.classList.toggle('hidden', tab !== 'shortcuts');
  envWorkspaceEl.classList.toggle('hidden', tab !== 'secrets');
  gameConfigWorkspaceEl.classList.toggle('hidden', tab !== 'gameconfig');
  aiWorkspaceEl.classList.toggle('hidden', tab !== 'ai');
  generatedTechniqueWorkspaceEl.classList.toggle('hidden', tab !== 'generatedTechniques');
  tradesWorkspaceEl.classList.toggle('hidden', tab !== 'trades');
  if (tab === 'redeem') {
    loadRedeemGroups(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载兑换码面板失败', true);
    });
  } else if (tab === 'world') {
    worldViewer.mount();
    if (state) {
      worldViewer.updateMapIds(state.mapIds);
    }
    worldViewer.startPolling();
  } else if (tab === 'server') {
    switchServerTab(currentServerTab);
  } else if (tab === 'players') {
    loadPlayerList(false, true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
    });
  } else if (tab === 'shortcuts') {
    loadPlayerList(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
    });
  } else if (tab === 'secrets') {
    loadEnvironmentVars().catch((e) => console.error('[GM]', e));
  } else if (tab === 'gameconfig') {
    loadGameConfig().catch((e) => console.error('[GM]', e));
  } else if (tab === 'ai') {
    loadAiProviderConfigs().catch((e) => console.error('[GM]', e));
  } else if (tab === 'generatedTechniques') {
    loadCurrentGeneratedTechniqueSubtab(false).catch(handleGeneratedTechniquePanelLoadError);
  } else if (tab === 'trades') {
    // 进入交易记录 tab：默认拉一次最近一页（无条件），让 GM 立刻能看到现状
    loadTrades({ resetPage: true }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
    });
  }
}

/** loadEditorCatalog：加载编辑器目录。 */
async function loadEditorCatalog(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  try {
    /** editorCatalog：编辑器目录。 */
    editorCatalog = await request<GmEditorCatalogRes>(`${GM_API_BASE_PATH}/editor-catalog`);
    /** editorCatalogSource：编辑器目录来源。 */
    editorCatalogSource = 'server';
  } catch {
    const localCatalog = getLocalEditorCatalog();
    editorCatalog = {
      ...localCatalog,
      buffs: localCatalog.buffs ?? [],
    };
    /** editorCatalogSource：编辑器目录来源。 */
    editorCatalogSource = 'local-fallback';
    setStatus(t('gm.editor.catalog.load-failed'), true);
  }
  renderShortcutMailComposer();
}

/** renderShortcutMailComposer：渲染Shortcut邮件Composer。 */
function renderShortcutMailComposer(preserveActiveInteraction = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!shortcutMailComposerEl) {
    return;
  }
  const targetPlayer = broadcastMailDraft.targetPlayerId
    ? (
      state?.players.find((player) => player.id === broadcastMailDraft.targetPlayerId)
      ?? (selectedPlayerDetail?.id === broadcastMailDraft.targetPlayerId ? selectedPlayerDetail : null)
    )
    : null;
  const structureKey = JSON.stringify({
    targetPlayerId: broadcastMailDraft.targetPlayerId,
    templateId: broadcastMailDraft.templateId,
    senderLabel: broadcastMailDraft.senderLabel,
    title: broadcastMailDraft.title,
    body: broadcastMailDraft.body,
    expireHours: broadcastMailDraft.expireHours,
    attachments: broadcastMailDraft.attachments.map((entry) => `${entry.itemId}:${entry.count}`),
    players: (state?.players ?? [])
      .filter((player) => !player.meta.isBot)
      .map((player) => `${player.id}:${player.playerNo ?? ''}:${player.roleName}:${player.accountName || ''}:${player.meta.online ? 1 : 0}`),
  });
  const activeElement = document.activeElement;
  const activeField = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLSelectElement
    || activeElement instanceof HTMLTextAreaElement
    ? activeElement
    : null;
  if (preserveActiveInteraction && activeField && shortcutMailComposerEl.contains(activeField)) {
    /** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
    shortcutMailComposerRefreshBlocked = true;
    return;
  }
  /** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
  shortcutMailComposerRefreshBlocked = false;
  if (lastShortcutMailComposerStructureKey === structureKey) {
    return;
  }
  shortcutMailComposerEl.innerHTML = getMailComposerMarkup(broadcastMailDraft, {
    scope: 'shortcut',
    submitLabel: targetPlayer ? t('gm.mail.send-to-player', { roleName: targetPlayer.roleName }) : t('gm.mail.send-all'),
    note: targetPlayer ? t('gm.mail.send-to-player.note') : t('gm.mail.send-all.note'),
    showTargetPlayer: true,
  });
  syncSearchableItemFields(shortcutMailComposerEl);
  /** lastShortcutMailComposerStructureKey：last Shortcut邮件Composer Structure Key。 */
  lastShortcutMailComposerStructureKey = structureKey;
}

/** flushShortcutMailComposerRefresh：处理刷新Shortcut邮件Composer Refresh。 */
function flushShortcutMailComposerRefresh(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!shortcutMailComposerEl || !shortcutMailComposerRefreshBlocked) {
    return;
  }
  const activeElement = document.activeElement;
  const activeField = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLSelectElement
    || activeElement instanceof HTMLTextAreaElement
    ? activeElement
    : null;
  if (activeField && shortcutMailComposerEl.contains(activeField)) {
    return;
  }
  /** lastShortcutMailComposerStructureKey：last Shortcut邮件Composer Structure Key。 */
  lastShortcutMailComposerStructureKey = null;
  /** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
  shortcutMailComposerRefreshBlocked = false;
  renderShortcutMailComposer(true);
}

/** GM 默认请求超时（毫秒）。超过该值仍未收到响应即立即 reject，避免 UI 永久卡在"正在保存…"。 */
const GM_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const gmRequestDeps = { getToken: () => token, onUnauthorized: (msg: string) => logout(msg) };
const gmRequestFn = apiCreateGmRequest(gmRequestDeps);
const gmRequestBlobFn = apiCreateGmRequestBlob(gmRequestDeps);

/** request：处理请求。 */
async function request<T>(path: string, init: RequestInit = {}, timeoutMs: number = GM_DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  return gmRequestFn<T>(path, init, timeoutMs);
}

/** requestBlob：处理请求Blob。 */
async function requestBlob(path: string, init: RequestInit = {}): Promise<Response> {
  return gmRequestBlobFn(path, init);
}

function isGmSectTemplateId(templateId: string | null | undefined): boolean {
  return mapIsGmSectTemplateId(templateId);
}

function isGmSectRuntimeInstance(instance: Pick<GmWorldInstanceSummary, 'instanceId' | 'templateId'>): boolean {
  return mapIsGmSectRuntimeInstance(instance);
}

function isGmSecretRealmRuntimeInstance(instance: Pick<GmWorldInstanceSummary, 'instanceId' | 'templateId' | 'mapGroupId' | 'mapGroupName'>): boolean {
  return mapIsGmSecretRealmRuntimeInstance(instance);
}

function resolvePositionMapCategory(instance: GmWorldInstanceSummary): GmPositionMapCategory {
  return mapResolvePositionMapCategory(instance);
}

function getMapSummary(mapId: string): GmMapSummary | null {
  return mapGetMapSummary(mapId, gmMapSummaries);
}

function getMapDisplayName(mapId: string, fallbackName?: string): string {
  return mapGetMapDisplayName(mapId, gmMapSummaries, fallbackName);
}

function getPositionMapCategoryCounts(): Map<GmPositionMapCategory, number> {
  return mapGetPositionMapCategoryCounts(gmWorldInstances);
}

function getPositionCategoryOptions(currentCategory: GmPositionMapCategory): Array<{ value: string; label: string }> {
  return mapGetPositionCategoryOptions(currentCategory, gmWorldInstances);
}

function getPositionMapInstances(category: GmPositionMapCategory): GmWorldInstanceSummary[] {
  return mapGetPositionMapInstances(category, gmWorldInstances);
}

function getPositionMapOptions(category: GmPositionMapCategory, currentMapId: string): Array<{ value: string; label: string }> {
  return mapGetPositionMapOptions(category, currentMapId, gmWorldInstances, gmMapSummaries, state?.mapIds ?? []);
}

function getPositionCategoryForMap(playerId: string, mapId: string): GmPositionMapCategory {
  return mapGetPositionCategoryForMap(playerId, mapId, positionMapCategoryDraft, gmWorldInstances, gmMapSummaries, state?.mapIds ?? []);
}


function renderPositionMapPicker(player: GmManagedPlayerRecord, draft: PlayerState): string {
  const category = getPositionCategoryForMap(player.id, draft.mapId);
  const mapOptions = getPositionMapOptions(category, draft.mapId);
  return mapPickerRenderPositionMapPickerHtml(category, getPositionCategoryOptions(category), mapOptions, draft.mapId);
}

function patchPositionMapSelect(category: GmPositionMapCategory, currentMapId: string): string {
  return mapPatchPositionMapSelect(category, currentMapId, editorContentEl, gmWorldInstances, gmMapSummaries, state?.mapIds ?? []);
}

function resolvePositionTargetInstanceId(mapId: string): string | undefined {
  return mapResolvePositionTargetInstanceId(mapId, editorContentEl, positionMapCategoryDraft, gmWorldInstances);
}

async function loadGmMapPickerCatalog(): Promise<void> {
  if (gmMapPickerCatalogLoaded) return;
  if (gmMapPickerCatalogLoading) return gmMapPickerCatalogLoading;
  gmMapPickerCatalogLoading = (async () => {
    const [mapsRes, instancesRes] = await Promise.all([
      request<GmMapListRes>(`${GM_API_BASE_PATH}/maps`),
      request<GmWorldInstanceListRes>(`${GM_API_BASE_PATH}/world/instances`),
    ]);
    gmMapSummaries = Array.isArray(mapsRes.maps) ? mapsRes.maps : [];
    gmWorldInstances = Array.isArray(instancesRes.instances) ? instancesRes.instances : [];
    gmMapPickerCatalogLoaded = true;
    clearEditorRenderCache();
  })().finally(() => {
    gmMapPickerCatalogLoading = null;
  });
  return gmMapPickerCatalogLoading;
}

/** mailActionsContext：mail-actions 对 gm.ts 的依赖。 */
const mailActionsContext: MailActionsContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  setStatus,
  t,
  confirm,
  buildGmPlayerApiPath,
  getDirectMailDraft: () => directMailDraft,
  setDirectMailDraft: (draft) => { directMailDraft = draft; },
  getBroadcastMailDraft: () => broadcastMailDraft,
  setBroadcastMailDraft: (draft) => { broadcastMailDraft = draft; },
  getDirectMailDraftPlayerId: () => directMailDraftPlayerId,
  setDirectMailDraftPlayerId: (id) => { directMailDraftPlayerId = id; },
  getRedeemDraft: () => redeemDraft,
  setRedeemDraft: (draft) => { redeemDraft = draft; },
  createDefaultMailAttachmentDraft,
  createDefaultMailComposerDraft,
  resetMailAttachmentPageStore,
  renderShortcutMailComposer,
  rerenderDirectMailComposer,
  getMailComposerPayload,
  getSelectedPlayerDetail,
  hasServerEditorCatalog,
  assertTrustedEditorCatalog,
  renderEditor,
  getState: () => state,
  getBroadcastMailIdempotencyState: () => broadcastMailIdempotencyState,
  getLastEditorStructureKey: () => lastEditorStructureKey,
  setLastEditorStructureKey: (key) => { lastEditorStructureKey = key; },
};

function updateMailDraftValue(scope: 'direct' | 'shortcut', path: string, rawValue: string): void { return mailActionsUpdateMailDraftValue(scope, path, rawValue, mailActionsContext); }
function updateRedeemDraftValue(path: string, rawValue: string): void { return mailActionsUpdateRedeemDraftValue(path, rawValue, mailActionsContext); }
function rerenderDirectMailComposer(): void { return mailActionsRerenderDirectMailComposer(mailActionsContext); }
function addMailAttachment(scope: 'direct' | 'shortcut'): void { return mailActionsAddMailAttachment(scope, mailActionsContext); }
function removeMailAttachment(scope: 'direct' | 'shortcut', index: number): void { return mailActionsRemoveMailAttachment(scope, index, mailActionsContext); }
async function sendDirectMail(): Promise<void> { return mailActionsSendDirectMail(mailActionsContext); }
async function sendShortcutMail(): Promise<void> { return mailActionsSendShortcutMail(mailActionsContext); }

/** getSelectedPlayer：读取Selected玩家。 */
function getSelectedPlayer(): GmManagedPlayerSummary | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!state || !selectedPlayerId) return null;
  return state.players.find((player) => player.id === selectedPlayerId) ?? null;
}

/** getSelectedPlayerDetail：读取Selected玩家详情。 */
function getSelectedPlayerDetail(): GmManagedPlayerRecord | null {
  return selectedPlayerDetail && selectedPlayerDetail.id === selectedPlayerId
    ? selectedPlayerDetail
    : null;
}

function getPlayerDatabaseTables(detail: GmManagedPlayerRecord | null): GmPlayerDatabaseTableView[] {
  return snapshotGetPlayerDatabaseTables(detail);
}

function clearPlayerDatabasePanel(message = '当前还没有数据库表数据。'): void {
  playerDatabaseTabsEl.innerHTML = '';
  playerDatabaseMetaEl.textContent = message;
  playerPersistedJsonEl.value = '';
}

function renderPlayerDatabasePanel(detail: GmManagedPlayerRecord): void {
  const tables = getPlayerDatabaseTables(detail);
  if (tables.length === 0) {
    currentDatabaseTable = '';
    clearPlayerDatabasePanel('当前数据库未启用，或该玩家还没有可展示的分表记录。');
    return;
  }

  if (!tables.some((entry) => entry.table === currentDatabaseTable)) {
    currentDatabaseTable = tables[0]?.table ?? '';
  }
  const activeEntry = tables.find((entry) => entry.table === currentDatabaseTable) ?? tables[0];
  if (!activeEntry) {
    clearPlayerDatabasePanel();
    return;
  }

  playerDatabaseTabsEl.innerHTML = tables.map((entry) => {
    const countLabel = entry.rowCount > 0 ? ` (${entry.rowCount})` : '';
    return `<button class="workspace-tab ${entry.table === activeEntry.table ? 'active' : ''}" data-database-table="${escapeHtml(entry.table)}" type="button">${escapeHtml(entry.table)}${countLabel}</button>`;
  }).join('');
  playerDatabaseMetaEl.textContent = activeEntry.rowCount > 0
    ? `当前查看 ${activeEntry.table} · ${activeEntry.rowCount} 行数据库记录。`
    : `当前查看 ${activeEntry.table} · 该表当前没有该玩家记录。`;
  setTextLikeValue(playerPersistedJsonEl, formatJson(activeEntry.payload ?? null));
}

/** createDefaultItem：创建默认物品。 */
function createDefaultItem(equipSlot?: string): ItemStack {
  return snapshotCreateDefaultItem(equipSlot);
}

/** createDefaultTechnique：创建默认Technique。 */
function createDefaultTechnique(): TechniqueState {
  return snapshotCreateDefaultTechnique();
}

/** createDefaultQuest：创建默认任务。 */
function createDefaultQuest(): QuestState {
  return snapshotCreateDefaultQuest();
}

/** createDefaultBuff：创建默认Buff。 */
function createDefaultBuff(): TemporaryBuffState {
  return snapshotCreateDefaultBuff();
}

function normalizeGmEquipmentSlots(source: Partial<EquipmentSlots> | null | undefined): EquipmentSlots {
  return snapshotNormalizeGmEquipmentSlots(source);
}

function getArtifactSlotLabel(slot: ArtifactSlot): string {
  return snapshotGetArtifactSlotLabel(slot);
}

function createDefaultArtifactSlot(slot: ArtifactSlot): PlayerState['artifacts']['slots'][number] {
  return snapshotCreateDefaultArtifactSlot(slot);
}

function normalizeGmArtifactState(source: PlayerState['artifacts'] | null | undefined): PlayerState['artifacts'] {
  return snapshotNormalizeGmArtifactState(source);
}

/** createDefaultPlayerSnapshot：创建默认玩家快照。 */
function createDefaultPlayerSnapshot(source?: PlayerState): PlayerState {
  return snapshotCreateDefaultPlayerSnapshot(source);
}

/** readCatalogSelectValue：处理read目录Select值。 */
function readCatalogSelectValue(
  kind: 'technique' | 'inventory-item' | 'equipment' | 'artifact',
  slot?: EquipSlot,
  index?: number,
): string {
  const selector = kind === 'equipment'
    ? `[data-catalog-select="${kind}"][data-slot="${slot}"]`
    : kind === 'artifact'
      ? `[data-catalog-select="${kind}"][data-index="${index}"]`
    : `[data-catalog-select="${kind}"]`;
  const field = editorContentEl.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  return field?.value ?? '';
}

/** updateInventoryAddControls：更新背包Add Controls。 */
function updateInventoryAddControls(resetSelectedItem = true): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const typeSelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-catalog-select="inventory-type"]');
  const itemField = editorContentEl.querySelector<HTMLElement>('[data-item-combobox][data-item-scope="inventory-add"]');
  const itemValueField = editorContentEl.querySelector<HTMLInputElement>('input[data-item-combobox-value][data-catalog-select="inventory-item"]');
  if (!typeSelect || !itemField || !itemValueField) {
    return;
  }
  typeSelect.value = currentInventoryAddType;
  itemField.dataset.placeholder = `点击后输入名称或 ID 搜索${ITEM_TYPE_LABELS[currentInventoryAddType]}模板`;
  if (resetSelectedItem) {
    itemValueField.value = '';
    const input = getSearchableItemInput(itemField);
    if (input) {
      input.value = '';
    }
  }
  syncSearchableItemField(itemField);
}

/** pathSegments：处理路径Segments。 */
function pathSegments(path: string): string[] {
  return fieldsPathSegments(path);
}

/** setValueByPath：处理set值By路径。 */
function setValueByPath(target: unknown, path: string, value: unknown): void {
  return fieldsSetValueByPath(target, path, value);
}

/** getValueByPath：读取值By路径。 */
function getValueByPath(target: unknown, path: string): unknown {
  return fieldsGetValueByPath(target, path);
}

/** removeArrayIndex：处理remove Array索引。 */
function removeArrayIndex(target: unknown, path: string, index: number): void {
  fieldsRemoveArrayIndex(target, path, index);
}

/** ensureArray：确保Array。 */
function ensureArray<T>(value: T[] | undefined | null): T[] {
  return fieldsEnsureArray(value);
}

/** buildHtmlAttributes：构建Html属性。 */
function buildHtmlAttributes(attributes: Record<string, string | undefined>): string {
  return fieldsBuildHtmlAttributes(attributes);
}

/** invEditorContext：inventory-editor 对 gm.ts 的依赖。 */
const invEditorContext: InventoryEditorContext = {
  escapeHtml,
  buildHtmlAttributes,
  findItemCatalogEntry,
  getInventoryAddItemOptions,
  getItemCatalogOptions,
  getActiveSearchableItemField: () => activeSearchableItemField,
  setActiveSearchableItemField: (el) => { activeSearchableItemField = el; },
  getEditorContentEl: () => editorContentEl,
  getCurrentInventoryAddType: () => currentInventoryAddType,
  flushBlockedEditorRender,
};

function getSearchableItemDisplayValue(itemId: string): string {
  return invEditorGetSearchableItemDisplayValue(itemId, invEditorContext);
}
function getSearchableItemOptions(scope: SearchableItemScope, slot?: EquipSlot): Array<{ value: string; label: string }> {
  return invEditorGetSearchableItemOptions(scope, slot, invEditorContext);
}
function searchableItemField(label: string, value: string, scope: SearchableItemScope, hiddenFieldAttrs: Record<string, string | undefined>, extraClass = '', slot?: EquipSlot, placeholder = '点击后输入名称或 ID 搜索物品模板', wrapperAttrs: Record<string, string | undefined> = {}): string {
  return invEditorSearchableItemField(label, value, scope, hiddenFieldAttrs, extraClass, slot, placeholder, wrapperAttrs, invEditorContext);
}
function getSearchableItemValueField(root: ParentNode): HTMLInputElement | null {
  return invEditorGetSearchableItemValueField(root, invEditorContext);
}
function getSearchableItemInput(root: ParentNode): HTMLInputElement | null {
  return invEditorGetSearchableItemInput(root, invEditorContext);
}
function getSearchableItemList(root: ParentNode): HTMLElement | null {
  return invEditorGetSearchableItemList(root, invEditorContext);
}
function getSearchableItemHint(root: ParentNode): HTMLElement | null {
  return invEditorGetSearchableItemHint(root, invEditorContext);
}
function getSearchableItemPopover(root: ParentNode): HTMLElement | null {
  return invEditorGetSearchableItemPopover(root, invEditorContext);
}
function normalizeSearchableItemText(value: string): string {
  return invEditorNormalizeSearchableItemText(value, invEditorContext);
}
function renderSearchableItemOptions(root: HTMLElement): void {
  return invEditorRenderSearchableItemOptions(root, invEditorContext);
}
function syncSearchableItemField(root: HTMLElement): void {
  return invEditorSyncSearchableItemField(root, invEditorContext);
}
function syncSearchableItemFields(scope: ParentNode): void {
  return invEditorSyncSearchableItemFields(scope, invEditorContext);
}
function closeSearchableItemField(root: HTMLElement): void {
  return invEditorCloseSearchableItemField(root, invEditorContext);
}
function openSearchableItemField(root: HTMLElement, resetQuery = true): void {
  return invEditorOpenSearchableItemField(root, resetQuery, invEditorContext);
}
function moveSearchableItemActiveIndex(root: HTMLElement, offset: number): void {
  return invEditorMoveSearchableItemActiveIndex(root, offset, invEditorContext);
}
function commitSearchableItemSelection(root: HTMLElement, value: string): void {
  return invEditorCommitSearchableItemSelection(root, value, invEditorContext);
}

/** flushBlockedEditorRender：处理刷新Blocked编辑器渲染。 */
function flushBlockedEditorRender(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!editorRenderRefreshBlocked || !state) {
    return;
  }
  if (
    activeSearchableItemField
    && activeSearchableItemField.isConnected
    && editorContentEl.contains(activeSearchableItemField)
    && activeSearchableItemField.dataset.open === 'true'
  ) {
    return;
  }
  /** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
  editorRenderRefreshBlocked = false;
  /** lastEditorStructureKey：last编辑器Structure Key。 */
  lastEditorStructureKey = null;
  renderEditor(state);
}

/** optionsMarkup：处理选项Markup。 */
function optionsMarkup<T extends string | number>(options: Array<{ value: T; label: string }>, selected: T | undefined): string {
  return fieldsOptionsMarkup(options, selected);
}

/** textField：处理文本字段。 */
function textField(label: string, path: string, value: string | undefined, extraClass = ''): string {
  return fieldsTextField(label, path, value, extraClass);
}

/** nullableTextField：处理nullable文本字段。 */
function nullableTextField(label: string, path: string, value: string | undefined, emptyMode: 'undefined' | 'null' = 'undefined', extraClass = ''): string {
  return fieldsNullableTextField(label, path, value, emptyMode, extraClass);
}

/** numberField：处理数值字段。 */
function numberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return fieldsNumberField(label, path, value, extraClass);
}

/** checkboxField：处理checkbox字段。 */
function checkboxField(label: string, path: string, checked: boolean | undefined): string {
  return fieldsCheckboxField(label, path, checked);
}

/** selectField：选择字段。 */
function selectField(
  label: string,
  path: string,
  value: string | number | undefined,
  options: Array<{ value: string | number; label: string }>,
  extraClass = '',
): string {
  return fieldsSelectField(label, path, value, options, extraClass);
}

/** jsonField：处理JSON字段。 */
function jsonField(label: string, path: string, value: unknown, emptyValue: 'null' | 'object' | 'array' = 'object', extraClass = ''): string {
  return fieldsJsonField(label, path, value, emptyValue, extraClass);
}

/** stringArrayField：处理string Array字段。 */
function stringArrayField(label: string, path: string, value: string[] | undefined, extraClass = ''): string {
  return fieldsStringArrayField(label, path, value, extraClass);
}

/** readonlyCodeBlock：处理readonly兑换码Block。 */
function readonlyCodeBlock(title: string, path: string, value: unknown): string {
  return fieldsReadonlyCodeBlock(title, path, value);
}

/** getAttrDisplayNumber：读取属性展示数值。 */
function getAttrDisplayNumber(value: number | undefined, fallback = 0): string {
  return editorGetAttrDisplayNumber(value, fallback);
}

/** renderAttributeSummaryGrid：渲染六维基础/总属性摘要。 */
function renderAttributeSummaryGrid(draft: PlayerState): string {
  return editorRenderAttributeSummaryGrid(draft);
}

function getTechniqueCategoryDisplayLabel(category: string | null | undefined): string {
  return editorGetTechniqueCategoryDisplayLabel(category);
}

function getTechniqueGradeDisplayLabel(grade: string | null | undefined): string {
  return editorGetTechniqueGradeDisplayLabel(grade);
}

function getTechniqueRealmLevelDisplayLabel(realmLv: number | null | undefined): string {
  return techGetTechniqueRealmLevelDisplayLabel(realmLv, editorCatalog?.realmLevels);
}

function normalizeTechniquePageSize(value: unknown): number {
  return editorNormalizeTechniquePageSize(value);
}

function getTechniqueRealmLvFilterValue(): number | null {
  return techGetTechniqueRealmLvFilterValue(currentTechniqueRealmLvFilter);
}

function getLearnedTechniqueIdSet(techniques: TechniqueState[]): Set<string> {
  return techGetLearnedTechniqueIdSet(techniques);
}

function getTechniqueCategoryCounts(techniques: TechniqueState[]): Record<TechniqueCategory, number> {
  return techGetTechniqueCategoryCounts(techniques, findTechniqueCatalogEntry);
}

function buildTechniqueCandidateMeta(candidate: Pick<GmTechniqueCandidate, 'source' | 'category' | 'grade' | 'realmLv' | 'techId'>): string {
  return techBuildTechniqueCandidateMeta(candidate, editorCatalog?.realmLevels);
}

function buildSystemTechniqueCandidates(learnedIds: Set<string>): GmTechniqueCandidate[] {
  return techBuildSystemTechniqueCandidates(learnedIds, editorCatalog?.techniques, editorCatalog?.realmLevels);
}

function buildGeneratedTechniqueCandidates(learnedIds: Set<string>): GmTechniqueCandidate[] {
  return techBuildGeneratedTechniqueCandidates(learnedIds, generatedTechniqueCandidates, editorCatalog?.realmLevels);
}

function matchesTechniqueFilters(entry: {
  techId: string;
  name?: string | null;
  category?: string | null;
  grade?: string | null;
  realmLv?: number | null;
  meta?: string | null;
}): boolean {
  return techMatchesTechniqueFilters(entry, {
    categoryFilter: currentTechniqueCategoryFilter,
    gradeFilter: currentTechniqueGradeFilter,
    realmLvFilter: currentTechniqueRealmLvFilter,
    searchQuery: currentTechniqueSearchQuery,
  });
}

function getFilteredSystemTechniqueCandidates(learnedIds: Set<string>): GmTechniqueCandidate[] {
  return techGetFilteredSystemTechniqueCandidates(learnedIds, editorCatalog?.techniques, editorCatalog?.realmLevels, {
    categoryFilter: currentTechniqueCategoryFilter,
    gradeFilter: currentTechniqueGradeFilter,
    realmLvFilter: currentTechniqueRealmLvFilter,
    searchQuery: currentTechniqueSearchQuery,
  });
}

function getFilteredLearnedTechniques(techniques: TechniqueState[]): Array<{ technique: TechniqueState; index: number; meta: string }> {
  return techGetFilteredLearnedTechniques(techniques, findTechniqueCatalogEntry, editorCatalog?.realmLevels, {
    categoryFilter: currentTechniqueCategoryFilter,
    gradeFilter: currentTechniqueGradeFilter,
    realmLvFilter: currentTechniqueRealmLvFilter,
    searchQuery: currentTechniqueSearchQuery,
  });
}

function paginateTechniqueEntries<T>(items: T[], page: number, pageSize: number): {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
} {
  return techPaginateTechniqueEntries(items, page, pageSize);
}

function createTechniqueFromGeneratedSummary(summary: GmGeneratedTechniqueSummary): TechniqueState {
  const existing = draftSnapshot?.techniques.find((technique) => technique.techId === summary.id);
  if (existing) {
    return clone(existing);
  }
  const grade = (summary.grade as TechniqueGrade | undefined) ?? 'mortal';
  const category = (summary.category as TechniqueCategory | undefined) ?? 'internal';
  const realmLv = Math.max(1, Math.trunc(Number(summary.realmLv) || 1));
  // 自创功法未定稿时，估算经验曲线以便修炼系统可正常推进
  const expCurve = expandTechniqueExpCurve(grade, realmLv, realmLv * 3, 1, category);
  const layers = expCurve.perLayerExp.map((expToNext, i) => ({ level: i + 1, expToNext }));
  return {
    ...createDefaultTechnique(),
    techId: summary.id,
    name: summary.name,
    grade,
    category,
    realmLv,
    layers,
    expToNext: getTechniqueExpToNext(1, layers),
  };
}

function getTechniqueCandidatePageData(techniques: TechniqueState[]): {
  items: GmTechniqueCandidate[];
  page: number;
  total: number;
  totalPages: number;
} {
  const learnedIds = getLearnedTechniqueIdSet(techniques);
  if (currentTechniqueCandidateSource === 'generated') {
    return {
      items: buildGeneratedTechniqueCandidates(learnedIds),
      page: currentTechniqueCandidatePage,
      total: generatedTechniqueCandidateTotal,
      totalPages: generatedTechniqueCandidatePageTotal,
    };
  }
  return paginateTechniqueEntries(
    getFilteredSystemTechniqueCandidates(learnedIds),
    currentTechniqueCandidatePage,
    currentTechniquePageSize,
  );
}

/** buildTechniqueManagerRenderContext：构建功法管理器渲染上下文。 */
function buildTechniqueManagerRenderContext(): TechniqueManagerRenderContext {
  return {
    currentTechniqueCandidateSource,
    currentTechniqueCandidatePage,
    currentTechniquePageSize,
    selectedTechniqueCandidateIds,
    generatedTechniqueCandidateLoading,
    generatedTechniqueCandidateError,
    generatedTechniqueCandidateTotal,
    generatedTechniqueCandidatePageTotal,
    currentTechniqueLearnedPage,
    selectedLearnedTechniqueIds,
    currentTechniqueEditorSubtab,
    currentTechniqueCategoryFilter,
    currentTechniqueGradeFilter,
    currentTechniqueRealmLvFilter,
    currentTechniqueSearchQuery,
    currentTechniqueRandomPickCount,
    setCurrentTechniqueCandidatePage: (page: number) => { currentTechniqueCandidatePage = page; },
    setCurrentTechniqueLearnedPage: (page: number) => { currentTechniqueLearnedPage = page; },
    getTechniqueCategoryCounts,
    getLearnedTechniqueOptions,
    getTechniqueEditorControls,
    getFilteredLearnedTechniques,
    paginateTechniqueEntries,
    getTechniqueCandidatePageData,
    hasServerEditorCatalog,
    getTechniqueCardTitle,
    getAutoSkillCardTitle,
    getAutoSkillCardMeta,
    escapeHtml,
    optionsMarkup,
    selectField,
    textField,
  };
}

/** renderTechniqueManager：渲染功法管理器。 */
function renderTechniqueManager(techniques: TechniqueState[], autoBattleSkills: AutoBattleSkillConfig[], cultivatingTechId: string | undefined): string {
  return techniqueManagerRenderTechniqueManager(techniques, autoBattleSkills, cultivatingTechId, buildTechniqueManagerRenderContext());
}

/** renderTechniqueFilterControls：渲染功法筛选控件。 */
function renderTechniqueFilterControls(mode: 'candidates' | 'learned'): string {
  return techniqueManagerRenderTechniqueFilterControls(mode, buildTechniqueManagerRenderContext());
}

/** renderTechniqueOverview：渲染功法总览。 */
function renderTechniqueOverview(techniques: TechniqueState[], autoBattleSkills: AutoBattleSkillConfig[], cultivatingTechId: string | undefined): string {
  return techniqueManagerRenderTechniqueOverview(techniques, autoBattleSkills, cultivatingTechId, buildTechniqueManagerRenderContext());
}

/** renderTechniqueCandidateList：渲染功法候选列表。 */
function renderTechniqueCandidateList(techniques: TechniqueState[]): string {
  return techniqueManagerRenderTechniqueCandidateList(techniques, buildTechniqueManagerRenderContext());
}

/** renderTechniqueManage：渲染功法管理。 */
function renderTechniqueManage(techniques: TechniqueState[]): string {
  return techniqueManagerRenderTechniqueManage(techniques, buildTechniqueManagerRenderContext());
}

/** renderLearnedTechniqueList：渲染已学功法列表。 */
function renderLearnedTechniqueList(techniques: TechniqueState[]): string {
  return techniqueManagerRenderLearnedTechniqueList(techniques, buildTechniqueManagerRenderContext());
}

/** renderTechniqueDetails：渲染功法详情。 */
function renderTechniqueDetails(techniques: TechniqueState[]): string {
  return techniqueManagerRenderTechniqueDetails(techniques, buildTechniqueManagerRenderContext());
}

/** renderEditorTabSection：渲染编辑器Tab Section。 */
function renderEditorTabSection(tab: GmEditorTab, content: string): string {
  return editorRenderEditorTabSection(tab, content);
}

const GM_CRAFT_SKILL_EDITOR_ENTRIES = [
  { key: 'alchemySkill', label: '炼丹' },
  { key: 'forgingSkill', label: '炼器' },
  { key: 'enhancementSkill', label: '强化' },
  { key: 'transmissionSkill', label: '传法' },
  { key: 'formationSkill', label: '阵法' },
  { key: 'gatherSkill', label: '采集' },
  { key: 'miningSkill', label: '挖矿' },
  { key: 'buildingSkill', label: '营造' },
] as const;

function getCraftSkillDraft(draft: PlayerState, key: (typeof GM_CRAFT_SKILL_EDITOR_ENTRIES)[number]['key']): NonNullable<PlayerState['alchemySkill']> {
  const value = draft[key] as PlayerState['alchemySkill'] | undefined;
  return buildCraftSkillSaveSnapshot(value);
}

function renderCraftSkillEditorCards(draft: PlayerState): string {
  return GM_CRAFT_SKILL_EDITOR_ENTRIES.map((entry) => {
    const skill = getCraftSkillDraft(draft, entry.key);
    return `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(entry.label)}</div>
            <div class="editor-card-meta">当前 ${skill.level} 级，经验 ${skill.exp} / ${skill.expToNext}</div>
          </div>
        </div>
        <div class="editor-grid compact">
          ${numberField('等级', `${entry.key}.level`, skill.level)}
          ${numberField('经验', `${entry.key}.exp`, skill.exp)}
          <div class="editor-field">
            <span>升级所需经验</span>
            <div class="editor-code">${escapeHtml(String(skill.expToNext))}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/** playerEditorRenderDeps：renderVisualEditor 的辅助函数依赖集合。 */
const playerEditorRenderDeps: PlayerEditorRenderDeps = {
  normalizeGmArtifactState,
  ensureArray,
  getManagedAccountActivityMeta,
  getManagedAccountStatusLabel,
  getManagedAccountRestrictionLabel,
  getManagedAccountRestrictionPillClass,
  getEditorCatalogFallbackNote,
  hasServerEditorCatalog,
  getEquipmentCardTitle,
  getEquipmentCardMeta,
  getArtifactSlotLabel,
  getItemEditorControls,
  searchableItemField,
  checkboxField,
  numberField,
  textField,
  nullableTextField,
  jsonField,
  selectField,
  stringArrayField,
  readonlyCodeBlock,
  optionsMarkup,
  getBonusCardTitle,
  getBonusCardMeta,
  getBuffCatalogOptions,
  getQuestCardTitle,
  getQuestCardMeta,
  getInventoryListMarkup,
  getVisibleInventoryItems,
  renderEditorTabSection,
  formatPlayerNo,
  formatDateTime,
  formatDurationSeconds,
  formatTradeTimestamp,
  getEditorBodyChipMarkup,
  renderPositionMapPicker,
  getRealmCatalogOptions,
  renderAttributeSummaryGrid,
  renderTechniqueManager,
  renderCraftSkillEditorCards,
  getTechniqueCatalogOptions,
  getInventoryAddTypeOptions,
  getMailComposerMarkup,
  renderPlayerRiskSection,
  escapeHtml,
};

/** renderVisualEditor：渲染Visual编辑器。 */
function renderVisualEditor(player: GmManagedPlayerRecord, draft: PlayerState): string {
  return playerEditorRenderVisualEditor(player, draft, playerEditorRenderDeps, {
    currentInventorySearchQuery,
    currentInventoryAddType,
    directMailDraft,
  });
}

/** renderSummary：渲染摘要。 */
function renderSummary(data: GmStateRes): void {
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
  const startedAt = data.perf.networkStatsStartedAt > 0 ? new Date(data.perf.networkStatsStartedAt) : null;
  const tickPerf = getTickPerf(data.perf);
  summaryTotalEl.textContent = `${data.playerStats.totalPlayers}`;
  summaryOnlineEl.textContent = `${data.playerStats.onlinePlayers}`;
  summaryOfflineHangingEl.textContent = `${data.playerStats.offlineHangingPlayers}`;
  summaryOfflineEl.textContent = `${data.playerStats.offlinePlayers}`;
  const maintenanceActive = data.operations?.maintenanceActive === true;
  const restartRequested = data.operations?.restartRequested === true;
  summaryMaintenanceEl.textContent = restartRequested
    ? '重启中'
    : maintenanceActive
      ? '维护中'
      : '关闭';
  toggleMaintenanceModeBtn.textContent = maintenanceActive ? '结束维护' : '开启维护中';
  toggleMaintenanceModeBtn.disabled = restartRequested;
  restartServerBtn.disabled = restartRequested;
  summaryBotsEl.textContent = `${data.botCount}`;
  summaryTickEl.textContent = tickPerf.lastMapId
    ? `${Math.round(tickPerf.lastMs)} ms · ${tickPerf.lastMapId}`
    : `${Math.round(tickPerf.lastMs)} ms`;
  summaryTickWindowEl.textContent = `${Math.round(tickPerf.windowBusyPercent)}%`;
  summaryCpuEl.textContent = `${Math.round(data.perf.cpuPercent)}%`;
  summaryMemoryEl.textContent = `${Math.round(data.perf.memoryMb)} MB`;
  summaryNetInEl.textContent = formatBytes(data.perf.networkInBytes);
  summaryNetOutEl.textContent = formatBytes(data.perf.networkOutBytes);
  summaryPathQueueEl.textContent = `${data.perf.pathfinding.queueDepth}`;
  summaryPathWorkersEl.textContent = `${data.perf.pathfinding.runningWorkers} / ${data.perf.pathfinding.workerCount}`;
  summaryPathCancelledEl.textContent = `${data.perf.pathfinding.cancelled}`;
  trafficResetMetaEl.textContent = data.perf.networkStatsEnabled === false
    ? '流量统计已被服务器配置关闭，点击重置可临时开启采集。'
    : startedAt
    ? `统计起点：${startedAt.toLocaleString()} · 已累计 ${formatDurationSeconds(elapsedSec)} · 大包采样${data.perf.networkPayloadCaptureEnabled === true ? '开启' : '关闭'}`
    : '统计区间尚未开始。';
  toggleNetworkPayloadCaptureBtn.textContent = data.perf.networkPayloadCaptureEnabled === true ? '关闭大包采样' : '开启大包采样';
  toggleNetworkPayloadCaptureBtn.classList.toggle('danger', data.perf.networkPayloadCaptureEnabled === true);
  trafficTotalInEl.textContent = formatBytes(data.perf.networkInBytes);
  trafficTotalInNoteEl.textContent = `均次 ${formatAverageBytesPerEvent(
    data.perf.networkInBytes,
    data.perf.networkInBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
  )} · 均秒 ${formatBytesPerSecond(data.perf.networkInBytes, elapsedSec)}`;
  trafficTotalOutEl.textContent = formatBytes(data.perf.networkOutBytes);
  trafficTotalOutNoteEl.textContent = `均次 ${formatAverageBytesPerEvent(
    data.perf.networkOutBytes,
    data.perf.networkOutBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
  )} · 均秒 ${formatBytesPerSecond(data.perf.networkOutBytes, elapsedSec)}`;
  cpuCurrentPercentEl.textContent = `${Math.round(data.perf.cpuPercent)}%`;
  cpuTickWindowPercentEl.textContent = `${Math.round(tickPerf.windowBusyPercent)}%`;
  cpuTickWindowNoteEl.textContent = tickPerf.windowTickCount > 0
    ? `${tickPerf.windowTickCount} 次 tick · 总计 ${Math.round(tickPerf.windowTotalMs)} ms · 均次 ${tickPerf.windowAvgMs.toFixed(1)} ms`
    : tickPerf.windowBusyPercent > 0
      ? `兼容口径估算 · 最近 tick 约 ${tickPerf.windowAvgMs.toFixed(1)} ms`
      : '最近采样窗口内暂无 tick 记录';
  const threading = data.perf.cpu.threading;
  const mainThread = threading?.mainThread;
  const workerThreads = threading?.workerThreads;
  cpuMainThreadPercentEl.textContent = `${Math.round(mainThread?.utilizationPercent ?? 0)}%`;
  cpuMainThreadNoteEl.textContent = mainThread
    ? `active ${mainThread.activeMs.toFixed(1)} ms · idle ${mainThread.idleMs.toFixed(1)} ms`
    : '主线程事件循环尚未采样';
  cpuWorkerThreadMsEl.textContent = `${Math.round(workerThreads?.windowDurationMs ?? 0)} ms`;
  cpuWorkerThreadNoteEl.textContent = workerThreads
    ? `${workerThreads.completedTasks} 个任务 · 均次 ${workerThreads.windowAvgMs.toFixed(2)} ms · 活跃 ${workerThreads.activeWorkers} · 进行中 ${workerThreads.inFlight} · fallback ${workerThreads.fallbackTasks}`
    : 'Worker 窗口尚未采样';
  cpuProfileMetaEl.textContent = data.perf.cpu.profileStartedAt > 0
    ? `CPU 画像起点：${new Date(data.perf.cpu.profileStartedAt).toLocaleString()} · 已累计 ${formatDurationSeconds(data.perf.cpu.profileElapsedSec)}`
    : 'CPU 画像尚未开始。';
  cpuCoreCountEl.textContent = `${data.perf.cpu.cores}`;
  cpuUserMsEl.textContent = `${Math.round(data.perf.cpu.userCpuMs)} ms`;
  cpuSystemMsEl.textContent = `${Math.round(data.perf.cpu.systemCpuMs)} ms`;
  cpuLoad1mEl.textContent = `${data.perf.cpu.loadAvg1m.toFixed(2)}`;
  cpuLoad5mEl.textContent = `${data.perf.cpu.loadAvg5m.toFixed(2)}`;
  cpuLoad15mEl.textContent = `${data.perf.cpu.loadAvg15m.toFixed(2)}`;
  cpuProcessUptimeEl.textContent = formatDurationSeconds(data.perf.cpu.processUptimeSec);
  cpuSystemUptimeEl.textContent = formatDurationSeconds(data.perf.cpu.systemUptimeSec);
  const rssMb = Math.max(0, data.perf.cpu.rssMb);
  const heapUsedMb = Math.max(0, data.perf.cpu.heapUsedMb);
  const heapTotalMb = Math.max(0, data.perf.cpu.heapTotalMb);
  const externalMb = Math.max(0, data.perf.cpu.externalMb);
  const heapFreeMb = Math.max(0, heapTotalMb - heapUsedMb);
  const residentGapMb = Math.max(0, rssMb - heapTotalMb - externalMb);
  memorySnapshotMetaEl.textContent = `当前快照：进程常驻 ${Math.round(rssMb)} MB · Heap 已用 ${Math.round(heapUsedMb)} MB · 外部内存 ${Math.round(externalMb)} MB`;
  memoryRssEl.textContent = `${Math.round(rssMb)} MB`;
  memoryHeapUsedEl.textContent = `${Math.round(heapUsedMb)} MB`;
  memoryHeapTotalEl.textContent = `${Math.round(heapTotalMb)} MB`;
  memoryExternalEl.textContent = `${Math.round(externalMb)} MB`;
  memoryHeapUsagePercentEl.textContent = formatPercent(heapUsedMb, heapTotalMb);
  memoryHeapUsageNoteEl.textContent = `已用 ${Math.round(heapUsedMb)} MB / 总量 ${Math.round(heapTotalMb)} MB`;
  memoryHeapFreeEl.textContent = `${Math.round(heapFreeMb)} MB`;
  memoryResidentGapEl.textContent = `${Math.round(residentGapMb)} MB`;
  memoryRssHeapRatioEl.textContent = heapUsedMb > 0 ? `${(rssMb / heapUsedMb).toFixed(2)}x` : '0x';
  memoryRssHeapRatioNoteEl.textContent = heapUsedMb > 0
    ? `RSS ${Math.round(rssMb)} MB / Heap 已用 ${Math.round(heapUsedMb)} MB`
    : '当前 Heap 已用接近 0，暂不计算倍率';
  const memoryEstimate = data.perf.memoryEstimate;
  memoryEstimateMetaEl.textContent = memoryEstimate?.generatedAt > 0
    ? `运行态容器估算：${new Date(memoryEstimate.generatedAt).toLocaleString()} · 已覆盖 ${formatBytes(memoryEstimate.coveredBytes)} / RSS ${formatBytes(memoryEstimate.rssBytes)} · 覆盖 ${memoryEstimate.coveragePercent.toFixed(1)}% · 未覆盖部分需看 V8 heap space 或 Heap Snapshot · 缓存 ${Math.round(memoryEstimate.cacheTtlMs / 1000)} 秒`
    : '运行态内存画像尚未生成。';
  // Worker Pool 状态渲染（已移至 Worker tab）
  renderWorkerPoolSection((data.perf as any).workerPool);
  pathfindingResetMetaEl.textContent = data.perf.pathfinding.statsStartedAt > 0
    ? `寻路统计起点：${new Date(data.perf.pathfinding.statsStartedAt).toLocaleString()} · 已累计 ${formatDurationSeconds(data.perf.pathfinding.statsElapsedSec)}`
    : '寻路统计区间尚未开始。';
  pathfindingAvgQueueMsEl.textContent = `${data.perf.pathfinding.avgQueueMs.toFixed(2)} ms`;
  pathfindingQueueNoteEl.textContent = `峰值 ${data.perf.pathfinding.maxQueueMs.toFixed(2)} ms · 队列峰值 ${data.perf.pathfinding.peakQueueDepth}`;
  pathfindingAvgRunMsEl.textContent = `${data.perf.pathfinding.avgRunMs.toFixed(2)} ms`;
  pathfindingRunNoteEl.textContent = `峰值 ${data.perf.pathfinding.maxRunMs.toFixed(2)} ms · 已完成 ${data.perf.pathfinding.completed}`;
  pathfindingAvgExpandedNodesEl.textContent = `${data.perf.pathfinding.avgExpandedNodes.toFixed(1)}`;
  pathfindingExpandedNoteEl.textContent = `峰值 ${data.perf.pathfinding.maxExpandedNodes} · 成功 ${data.perf.pathfinding.succeeded}`;
  pathfindingDropTotalEl.textContent = `${data.perf.pathfinding.droppedPending + data.perf.pathfinding.droppedStaleResults}`;
  pathfindingDropNoteEl.textContent = `等待丢弃 ${data.perf.pathfinding.droppedPending} · 结果过期 ${data.perf.pathfinding.droppedStaleResults}`;
  renderPerfLists(data);
}

/** renderPlayerList：渲染玩家列表。 */
function renderPlayerList(data: GmStateRes): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const filtered = getFilteredPlayers(data);

  if (!selectedPlayerId || !filtered.some((player) => player.id === selectedPlayerId)) {
    /** selectedPlayerId：selected玩家ID。 */
    selectedPlayerId = filtered[0]?.id ?? data.players[0]?.id ?? null;
  }

  if (filtered.length === 0) {
    lastPlayerListStructureKey = renderGmPlayerListSection({
      playerListEl,
      playerPageMetaEl,
      playerPrevPageBtn,
      playerNextPageBtn,
    }, {
      data,
      filtered,
      selectedPlayerId,
      lastStructureKey: lastPlayerListStructureKey,
      getPlayerRowMarkup,
      patchPlayerRow,
    });
    return;
  }
  lastPlayerListStructureKey = renderGmPlayerListSection({
    playerListEl,
    playerPageMetaEl,
    playerPrevPageBtn,
    playerNextPageBtn,
  }, {
    data,
    filtered,
    selectedPlayerId,
    lastStructureKey: lastPlayerListStructureKey,
    getPlayerRowMarkup,
    patchPlayerRow,
  });
}

/** renderEditor：渲染编辑器。 */
function renderEditor(data: GmStateRes): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = data.players.find((player) => player.id === selectedPlayerId) ?? null;
  if (!selected) {
    editorEmptyEl.classList.remove('hidden');
    editorPanelEl.classList.add('hidden');
    /** draftSnapshot：draft快照。 */
    draftSnapshot = null;
    /** draftSourcePlayerId：draft来源玩家ID。 */
    draftSourcePlayerId = null;
    /** selectedPlayerDetail：selected玩家详情。 */
    selectedPlayerDetail = null;
    /** selectedPlayerDetailError：selected玩家详情错误。 */
    selectedPlayerDetailError = null;
    /** loadingPlayerDetailId：loading玩家详情ID。 */
    loadingPlayerDetailId = null;
    clearPlayerDatabasePanel();
    savePlayerBtn.disabled = true;
    refreshPlayerBtn.disabled = true;
    openPlayerMailBtn.disabled = true;
    removeBotBtn.style.display = 'none';
    removeBotBtn.disabled = true;
    clearEditorRenderCache();
    return;
  }

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    editorEmptyEl.classList.remove('hidden');
    editorEmptyEl.textContent = loadingPlayerDetailId === selected.id
      ? t('gm.loading-player-detail')
      : (selectedPlayerDetailError?.trim() || t('gm.player.detail-unavailable'));
    editorPanelEl.classList.add('hidden');
    clearPlayerDatabasePanel(loadingPlayerDetailId === selected.id
      ? t('gm.loading-database-detail')
      : t('gm.database.detail-unavailable'));
    savePlayerBtn.disabled = true;
    refreshPlayerBtn.disabled = true;
    openPlayerMailBtn.disabled = true;
    removeBotBtn.style.display = 'none';
    removeBotBtn.disabled = true;
    clearEditorRenderCache();
    return;
  }

  if (!draftSnapshot || draftSourcePlayerId !== detail.id || !editorDirty) {
    /** draftSnapshot：draft快照。 */
    draftSnapshot = createDefaultPlayerSnapshot(detail.snapshot);
    /** draftSourcePlayerId：draft来源玩家ID。 */
    draftSourcePlayerId = detail.id;
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
  }

  editorEmptyEl.classList.add('hidden');
  editorPanelEl.classList.remove('hidden');
  ensureDirectMailDraft(detail.id);

  editorTitleEl.textContent = detail.roleName;
  editorSubtitleEl.textContent = getEditorSubtitle(detail);
  editorMetaEl.innerHTML = getEditorMetaMarkup(detail);

  const structureKey = buildEditorStructureKey(detail, draftSnapshot);
  const activeElement = document.activeElement;
  const hasActiveEditorInteraction = (
    (!!activeSearchableItemField
      && activeSearchableItemField.isConnected
      && editorContentEl.contains(activeSearchableItemField)
      && activeSearchableItemField.dataset.open === 'true')
    || (activeElement instanceof HTMLElement
      && editorContentEl.contains(activeElement)
      && (activeElement instanceof HTMLSelectElement
        || activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement))
  );
  const shouldDelayStructureRefresh = (
    lastEditorStructureKey !== structureKey
    && draftSourcePlayerId === detail.id
    && hasActiveEditorInteraction
  );
  if (shouldDelayStructureRefresh) {
    /** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
    editorRenderRefreshBlocked = true;
    return;
  }
  /** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
  editorRenderRefreshBlocked = false;
  if (lastEditorStructureKey !== structureKey) {
    editorContentEl.innerHTML = renderVisualEditor(detail, draftSnapshot);
    /** lastEditorStructureKey：last编辑器Structure Key。 */
    lastEditorStructureKey = structureKey;
  } else {
    if (!editorDirty) {
      syncVisualEditorFieldsFromDraft(draftSnapshot);
    }
    patchEditorPreview(detail, draftSnapshot);
  }
  updateInventoryAddControls(false);
  syncSearchableItemFields(editorContentEl);

  renderPlayerDatabasePanel(detail);
  switchEditorTab(currentEditorTab);
  refreshPlayerBtn.disabled = false;
  openPlayerMailBtn.disabled = false;

  removeBotBtn.style.display = detail.meta.isBot ? '' : 'none';
  removeBotBtn.disabled = !detail.meta.isBot;
}

/** render：渲染渲染。 */
function render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!state) return;
  applyServerTabVisibility(currentServerTab);
  renderSummary(state);
  renderDatabasePanel();
  if (currentTab === 'players') {
    renderPlayerList(state);
    renderEditor(state);
  }
  if (currentTab === 'shortcuts') {
    renderShortcutMailComposer(true);
  }
}

/** getEditorTabSection：读取编辑器Tab Section。 */
function getEditorTabSection(tab: GmEditorTab): HTMLElement | null {
  return editorContentEl.querySelector<HTMLElement>(`[data-editor-tab="${tab}"]`);
}

/** syncVisualEditorToDraft：同步Visual编辑器To Draft。 */
function syncVisualEditorToDraft(scope?: ParentNode): {
/**
 * ok：ok相关字段。
 */
 ok: true } | {
 /**
 * ok：ok相关字段。
 */
 ok: false;
 /**
 * message：message相关字段。
 */
 message: string } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) {
    return { ok: false, message: t('gm.player.no-editable') };
  }

  const next = clone(draftSnapshot);
  const fields = (scope ?? editorContentEl).querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-bind]');

  for (const field of fields) {
    const path = field.dataset.bind;
    const kind = field.dataset.kind;
    if (!path || !kind) continue;

    let value: unknown;
    if (kind === 'boolean' && field instanceof HTMLInputElement) {
      value = field.checked;
    } else if (kind === 'number') {
      value = Math.floor(Number(field.value || '0'));
      if (!Number.isFinite(value)) {
        return { ok: false, message: `${path} 不是合法数字` };
      }
    } else if (kind === 'nullable-string') {
      const text = field.value.trim();
      const emptyMode = field.dataset.emptyMode;
      value = text.length > 0 ? text : emptyMode === 'null' ? null : undefined;
    } else if (kind === 'string-array') {
      value = field.value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else if (kind === 'json') {
      const text = field.value.trim();
      if (!text) {
        const emptyJson = field.dataset.emptyJson;
        value = emptyJson === 'array' ? [] : emptyJson === 'null' ? null : {};
      } else {
        try {
          value = JSON.parse(text);
        } catch {
          return { ok: false, message: `${path} 的 JSON 解析失败` };
        }
      }
    } else {
      value = field.value;
    }

    setValueByPath(next, path, value);
  }

  /** draftSnapshot：draft快照。 */
  draftSnapshot = next;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = true;
  return { ok: true };
}

/** mutateDraft：处理mutate Draft。 */
function mutateDraft(mutator: (draft: PlayerState) => void): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const synced = syncVisualEditorToDraft(getEditorTabSection(currentEditorTab) ?? undefined);
  if (!synced.ok) {
    setStatus(synced.message, true);
    return false;
  }
  if (!draftSnapshot || !state) return false;
  mutator(draftSnapshot);
  /** editorDirty：编辑器Dirty。 */
  editorDirty = true;
  renderEditor(state);
  return true;
}

/** applyCatalogBindingChange：应用目录Binding变更。 */
function applyCatalogBindingChange(path: string, value: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) return false;

  const inventoryMatch = path.match(/^inventory\.items\.(\d+)\.itemId$/);
  const rawEquipmentMatch = path.match(/^equipment\.([^.]+)\.itemId$/);
  const equipmentMatch = rawEquipmentMatch && EQUIP_SLOTS.includes(rawEquipmentMatch[1] as EquipSlot)
    ? rawEquipmentMatch
    : null;
  const artifactMatch = path.match(/^artifacts\.slots\.(\d+)\.item\.itemId$/);
  const techniqueMatch = path.match(/^techniques\.(\d+)\.techId$/);
  const buffMatch = path.match(/^temporaryBuffs\.(\d+)\.buffId$/);
  if ((inventoryMatch || equipmentMatch || artifactMatch || techniqueMatch || buffMatch) && !hasServerEditorCatalog()) {
    setStatus(t('gm.editor.catalog.binding-unavailable'), true);
    /** lastEditorStructureKey：last编辑器Structure Key。 */
    lastEditorStructureKey = null;
    if (state) {
      renderEditor(state);
    }
    return true;
  }

  let changed = false;
  if (inventoryMatch) {
    const index = Number(inventoryMatch[1]);
    const previousCount = draftSnapshot.inventory.items[index]?.count ?? 1;
    draftSnapshot.inventory.items[index] = createItemFromCatalog(value, previousCount);
    /** changed：changed。 */
    changed = true;
  }

  if (equipmentMatch) {
    const slot = equipmentMatch[1] as EquipSlot;
    draftSnapshot.equipment[slot] = value ? createItemFromCatalog(value) : null;
    /** changed：changed。 */
    changed = true;
  }

  if (artifactMatch) {
    const index = Number(artifactMatch[1]);
    draftSnapshot.artifacts = normalizeGmArtifactState(draftSnapshot.artifacts);
    if (draftSnapshot.artifacts.slots[index]) {
      draftSnapshot.artifacts.slots[index].item = value ? createItemFromCatalog(value) : null;
    }
    /** changed：changed。 */
    changed = true;
  }

  if (techniqueMatch) {
    const index = Number(techniqueMatch[1]);
    draftSnapshot.techniques[index] = createTechniqueFromCatalog(value);
    /** changed：changed。 */
    changed = true;
  }

  if (buffMatch) {
    const index = Number(buffMatch[1]);
    const previous = draftSnapshot.temporaryBuffs?.[index];
    draftSnapshot.temporaryBuffs ??= [];
    draftSnapshot.temporaryBuffs[index] = createBuffFromCatalog(value, {
      stacks: previous?.stacks ?? 1,
      remainingTicks: previous?.remainingTicks ?? 1,
    });
    /** changed：changed。 */
    changed = true;
  }

  if (path === 'cultivatingTechId' && !value) {
    draftSnapshot.cultivatingTechId = undefined;
    /** changed：changed。 */
    changed = true;
  }

  if (!changed) {
    return false;
  }
  /** editorDirty：编辑器Dirty。 */
  editorDirty = true;
  /** lastEditorStructureKey：last编辑器Structure Key。 */
  lastEditorStructureKey = null;
  if (state) {
    renderEditor(state);
  }
  return true;
}

/** loadState：加载状态。 */
async function loadState(silent = false, refreshDetail = false, forceIncludePlayers = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!token) return;
  const shouldIncludePlayers = forceIncludePlayers
    || (!silent && (currentTab === 'players' || currentTab === 'shortcuts'))
    || refreshDetail;
  const params = new URLSearchParams();
  if (shouldIncludePlayers) {
    params.set('page', String(currentPlayerPage));
    params.set('pageSize', '50');
    params.set('sort', currentPlayerSort);
    params.set('accountStatus', currentPlayerAccountStatusFilter);
    params.set('includePlayers', '1');
    const keyword = playerSearchInput.value.trim();
    if (keyword) {
      params.set('keyword', keyword);
    }
  }
  if (currentTab === 'server' && currentServerTab === 'memory') {
    params.set('includeMemoryEstimate', '1');
  }
  let data = await request<GmStateRes>(buildGmStateApiPath(params));
  assertGmStateResponseShape(data);
  if (!shouldIncludePlayers && state) {
    data = {
      ...data,
      players: state.players,
    };
  }
  /** state：状态。 */
  state = data;
  if (shouldIncludePlayers) {
    /** currentPlayerPage：当前玩家分页。 */
    currentPlayerPage = data.playerPage.page;
    /** currentPlayerTotalPages：当前玩家总量Pages。 */
    currentPlayerTotalPages = data.playerPage.totalPages;
  }
  try {
    await loadGmMapPickerCatalog();
  } catch (error) {
    if (!gmMapPickerCatalogWarned) {
      gmMapPickerCatalogWarned = true;
      console.warn('GM 地图选择目录加载失败', error);
    }
  }
  const previousSelectedPlayerId = selectedPlayerId;
  if (shouldIncludePlayers) {
    if (!selectedPlayerId || !data.players.some((player) => player.id === selectedPlayerId)) {
      /** selectedPlayerId：selected玩家ID。 */
      selectedPlayerId = data.players[0]?.id ?? null;
      if (selectedPlayerDetail?.id !== selectedPlayerId) {
        selectedPlayerDetail = null;
      }
    }
  }
  render();
  const shouldLoadDetail = shouldIncludePlayers && !!selectedPlayerId && (
    refreshDetail
    || selectedPlayerId !== previousSelectedPlayerId
    || selectedPlayerDetail?.id !== selectedPlayerId
  );
  if (shouldLoadDetail && selectedPlayerId) {
    await loadSelectedPlayerDetail(selectedPlayerId, true);
  } else if (shouldIncludePlayers && !selectedPlayerId) {
    /** selectedPlayerDetail：selected玩家详情。 */
    selectedPlayerDetail = null;
    /** selectedPlayerDetailError：selected玩家详情错误。 */
    selectedPlayerDetailError = null;
    /** loadingPlayerDetailId：loading玩家详情ID。 */
    loadingPlayerDetailId = null;
  }
  if (!silent && shouldIncludePlayers) {
    setStatus(`已同步角色列表第 ${data.playerPage.page} / ${data.playerPage.totalPages} 页，本页 ${data.players.length} 条，共 ${data.playerPage.total} 条`);
  }
  if (currentTab === 'server' && currentServerTab === 'database') {
    await loadDatabaseState(true);
  }
  // 同步地图列表到世界管理
  if (currentTab === 'world') {
    worldViewer.updateMapIds(data.mapIds);
  }
}

function buildPlayerListQueryParams(refresh = false): URLSearchParams {
  const params = new URLSearchParams({
    page: String(currentPlayerPage),
    pageSize: '50',
    sort: currentPlayerSort,
    accountStatus: currentPlayerAccountStatusFilter,
  });
  if (refresh) {
    params.set('refresh', '1');
  }
  const keyword = playerSearchInput.value.trim();
  if (keyword) {
    params.set('keyword', keyword);
  }
  return params;
}

async function loadPlayerList(silent = true, refreshDetail = false, refreshList = false): Promise<void> {
  if (!token) return;
  if (!state) {
    await loadState(silent, refreshDetail, true);
    return;
  }
  const nonce = ++playerListRequestNonce;
  const data = await request<GmPlayerListRes>(buildGmPlayersApiPath(buildPlayerListQueryParams(refreshList)));
  if (nonce !== playerListRequestNonce) {
    return;
  }
  state = {
    ...state,
    players: data.players,
    playerPage: data.playerPage,
    playerStats: data.playerStats,
    botCount: data.botCount,
  };
  currentPlayerPage = data.playerPage.page;
  currentPlayerTotalPages = data.playerPage.totalPages;

  const previousSelectedPlayerId = selectedPlayerId;
  if (!selectedPlayerId || !data.players.some((player) => player.id === selectedPlayerId)) {
    selectedPlayerId = data.players[0]?.id ?? null;
    if (selectedPlayerDetail?.id !== selectedPlayerId) {
      selectedPlayerDetail = null;
    }
  }
  render();

  const shouldLoadDetail = !!selectedPlayerId && (
    refreshDetail
    || selectedPlayerId !== previousSelectedPlayerId
    || selectedPlayerDetail?.id !== selectedPlayerId
  );
  if (shouldLoadDetail && selectedPlayerId) {
    await loadSelectedPlayerDetail(selectedPlayerId, true);
  } else if (!selectedPlayerId) {
    selectedPlayerDetail = null;
    selectedPlayerDetailError = null;
    loadingPlayerDetailId = null;
  }
  if (!silent) {
    setStatus(`已同步角色列表第 ${data.playerPage.page} / ${data.playerPage.totalPages} 页，本页 ${data.players.length} 条，共 ${data.playerPage.total} 条`);
  }
}

/** loadSelectedPlayerDetail：加载Selected玩家详情。 */
async function loadSelectedPlayerDetail(playerId: string, silent = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const nonce = ++detailRequestNonce;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = playerId;
  /** selectedPlayerDetailError：selected玩家详情错误。 */
  selectedPlayerDetailError = null;
  clearEditorRenderCache();
  render();
  try {
    const data = await request<GmPlayerDetailRes>(buildGmPlayerApiPath(playerId));
    assertGmPlayerDetailResponseShape(data);
    if (nonce !== detailRequestNonce || selectedPlayerId !== playerId) {
      return;
    }
    /** selectedPlayerDetail：selected玩家详情。 */
    selectedPlayerDetail = data.player;
    /** selectedPlayerDetailError：selected玩家详情错误。 */
    selectedPlayerDetailError = null;
    if (!silent) {
      setStatus(t('gm.player.detail-loaded', { name: data.player.name }));
    }
  } catch (error) {
    if (nonce === detailRequestNonce && selectedPlayerId === playerId) {
      selectedPlayerDetail = null;
      selectedPlayerDetailError = error instanceof Error ? error.message : t('gm.player.detail-load-failed');
    }
    throw error;
  } finally {
    if (nonce === detailRequestNonce && loadingPlayerDetailId === playerId) {
      loadingPlayerDetailId = null;
    }
    render();
  }
}

/** startPolling：启动Polling。 */
function startPolling(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
  }
  pollTimer = window.setInterval(() => {
    loadState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.refresh.failed'), true);
    });
  }, GM_PANEL_POLL_INTERVAL_MS);
}

/** showShell：处理显示Shell。 */
function showShell(): void {
  loginOverlay.classList.add('hidden');
  gmShell.classList.remove('hidden');
}

/** showLogin：处理显示Login。 */
function showLogin(): void {
  loginOverlay.classList.remove('hidden');
  gmShell.classList.add('hidden');
}

/** logout：处理logout。 */
function logout(message?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** token：令牌。 */
  token = '';
  /** state：状态。 */
  state = null;
  /** databaseState：数据库状态。 */
  databaseState = null;
  /** databaseStateLoading：数据库状态Loading。 */
  databaseStateLoading = false;
  /** serverLogsEntries：服务端日志已加载行。 */
  serverLogsEntries = [];
  /** serverLogsNextBeforeSeq：服务端日志向上翻页游标。 */
  serverLogsNextBeforeSeq = undefined;
  /** serverLogsHasMore：服务端日志是否还有更早行。 */
  serverLogsHasMore = false;
  /** serverLogsBufferSize：服务端日志缓冲行数。 */
  serverLogsBufferSize = 0;
  /** serverLogsLoading：服务端日志读取中。 */
  serverLogsLoading = false;
  renderServerLogsPanel();
  /** redeemGroupsState：兑换分组状态。 */
  redeemGroupsState = [];
  /** selectedRedeemGroupId：selected兑换分组ID。 */
  selectedRedeemGroupId = null;
  /** redeemGroupDetailState：兑换分组详情状态。 */
  redeemGroupDetailState = null;
  /** redeemDraft：兑换Draft。 */
  redeemDraft = createDefaultRedeemGroupDraft();
  /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
  redeemLatestGeneratedCodes = [];
  /** redeemLoading：兑换Loading。 */
  redeemLoading = false;
  /** selectedPlayerId：selected玩家ID。 */
  selectedPlayerId = null;
  /** selectedPlayerDetail：selected玩家详情。 */
  selectedPlayerDetail = null;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = null;
  /** draftSnapshot：draft快照。 */
  draftSnapshot = null;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  /** draftSourcePlayerId：draft来源玩家ID。 */
  draftSourcePlayerId = null;
  ensureDirectMailDraft(null);
  /** broadcastMailDraft：broadcast邮件Draft。 */
  broadcastMailDraft = createDefaultMailComposerDraft();
  resetMailAttachmentPageStore('shortcut');
  sessionStorage.removeItem(GM_ACCESS_TOKEN_STORAGE_KEY);
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    /** pollTimer：poll Timer。 */
    pollTimer = null;
  }
  if (playerSearchTimer !== null) {
    window.clearTimeout(playerSearchTimer);
    /** playerSearchTimer：玩家搜索Timer。 */
    playerSearchTimer = null;
  }
  playerListEl.innerHTML = '';
  /** lastPlayerListStructureKey：last玩家列表Structure Key。 */
  lastPlayerListStructureKey = null;
  clearEditorRenderCache();
  /** currentPlayerPage：当前玩家分页。 */
  currentPlayerPage = 1;
  /** currentPlayerTotalPages：当前玩家总量Pages。 */
  currentPlayerTotalPages = 1;
  playerSearchInput.value = '';
  playerPageMetaEl.textContent = '第 1 / 1 页 · 共 0 条';
  playerPrevPageBtn.disabled = true;
  playerNextPageBtn.disabled = true;
  /** lastNetworkInStructureKey：last Network In Structure Key。 */
  lastNetworkInStructureKey = null;
  /** lastNetworkOutStructureKey：last Network Out Structure Key。 */
  lastNetworkOutStructureKey = null;
  /** lastCpuBreakdownStructureKey：last Cpu Breakdown Structure Key。 */
  lastCpuBreakdownStructureKey = null;
  collapsedCpuBreakdownGroupKeys.clear();
  collapsedTrafficBreakdownGroupKeys.clear();
  /** lastMemoryDomainStructureKey：last Memory Domain Structure Key。 */
  lastMemoryDomainStructureKey = null;
  /** lastMemoryInstanceStructureKey：last Memory Instance Structure Key。 */
  lastMemoryInstanceStructureKey = null;
  summaryNetInBreakdownEl.innerHTML = '';
  summaryNetOutBreakdownEl.innerHTML = '';
  cpuBreakdownListEl.innerHTML = '';
  memoryDomainListEl.innerHTML = '';
  memoryInstanceListEl.innerHTML = '';
  clearPlayerDatabasePanel();
  worldViewer.stopPolling();
  renderShortcutMailComposer();
  switchTab('server');
  switchEditorTab('basic');
  loginErrorEl.textContent = message ?? '';
  setStatus('');
  showLogin();
}

/** delayRefresh：处理delay Refresh。 */
async function delayRefresh(message: string): Promise<void> {
  setStatus(message);
  await new Promise((resolve) => window.setTimeout(resolve, GM_APPLY_DELAY_MS));
  if (currentTab === 'players' || currentTab === 'shortcuts') {
    await loadPlayerList(true, true, true);
  } else {
    await loadState(true, true);
  }
  setStatus(`${message}，已完成同步`);
}

/** login：处理login。 */
async function login(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const password = passwordInput.value.trim();
  if (!password) {
    loginErrorEl.textContent = t('gm.login.enter-password');
    return;
  }

  loginSubmitBtn.disabled = true;
  loginErrorEl.textContent = '';

  try {
    const result = await request<GmLoginRes>(`${GM_AUTH_API_BASE_PATH}/login`, {
      method: 'POST',
      body: JSON.stringify({
        password,
        // 管理端入口默认申请全部高危 scope；服务端仍会按 ALLOWED_SCOPES 校验。
        scopes: [...GM_ALL_HIGH_RISK_SCOPES],
      } satisfies GmLoginReq),
    });
    /** token：令牌。 */
    token = result.accessToken;
    sessionStorage.setItem(GM_ACCESS_TOKEN_STORAGE_KEY, token);
    showShell();
    await loadEditorCatalog();
    await loadState();
    startPolling();
    passwordInput.value = '';
    setStatus(t('gm.login.token-issued', { hours: Math.round(result.expiresInSec / 3600) }));
  } catch (error) {
    loginErrorEl.textContent = error instanceof Error ? error.message : t('gm.login.failed');
  } finally {
    loginSubmitBtn.disabled = false;
  }
}

/** envConfigContext：env-config-extra 对 gm.ts 的依赖。 */
const envConfigContext: EnvConfigContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  setStatus,
  escapeHtml,
  loadRuntimeFlags,
  getRuntimeFlags: () => runtimeFlags,
  getRuntimeFlagsLoading: () => runtimeFlagsLoading,
  buildRuntimeFlagsHtml,
  bindRuntimeFlagsEvents,
};

/** loadEnvironmentVars：加载环境变量。 */
function loadEnvironmentVars(): Promise<void> {
  return envConfigLoadEnvironmentVars(envConfigContext);
}

/** reloadEnvironmentVars：重载环境变量。 */
function reloadEnvironmentVars(): Promise<void> {
  return envConfigReloadEnvironmentVars(envConfigContext);
}

/** toggleAllEnvironmentGroups：展开/折叠所有环境变量分组。 */
function toggleAllEnvironmentGroups(open: boolean): void {
  return envConfigToggleAllEnvironmentGroups(open, envConfigContext);
}

/** loadGameConfig：加载游戏配置。 */
function loadGameConfig(): Promise<void> {
  return envConfigLoadGameConfig(envConfigContext);
}

/** renderGameConfig：渲染游戏配置。 */
function renderGameConfig(): void {
  return envConfigRenderGameConfig(envConfigContext);
}

/** toggleAllGameConfigGroups：展开/折叠所有游戏配置分组。 */
function toggleAllGameConfigGroups(open: boolean): void {
  return envConfigToggleAllGameConfigGroups(open, envConfigContext);
}

/** loadAiProviderConfigs：加载AI供应商配置。 */
function loadAiProviderConfigs(): Promise<void> {
  return envConfigLoadAiProviderConfigs(envConfigContext);
}

/** addAiProviderConfig：新增AI供应商配置。 */
function addAiProviderConfig(kind: GmAiProviderKind): void {
  return envConfigAddAiProviderConfig(kind, envConfigContext);
}

// ===== AI 生成功法 tab =====

/** genTechContext：generated-technique 对 gm.ts 的依赖。 */
const genTechContext: GeneratedTechniqueContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  setStatus,
  escapeHtml,
  getCurrentGeneratedTechniqueSubtab: () => currentGeneratedTechniqueSubtab,
  setCurrentGeneratedTechniqueSubtab: (tab) => { currentGeneratedTechniqueSubtab = tab; },
  getGeneratedTechniquePage: () => generatedTechniquePage,
  setGeneratedTechniquePage: (page) => { generatedTechniquePage = page; },
  getTechniqueGenerationJobPage: () => techniqueGenerationJobPage,
  setTechniqueGenerationJobPage: (page) => { techniqueGenerationJobPage = page; },
  getGeneratedTechniques: () => generatedTechniques,
  setGeneratedTechniques: (techniques) => { generatedTechniques = techniques; },
  getGeneratedTechniqueTotalPages: () => generatedTechniqueTotalPages,
  setGeneratedTechniqueTotalPages: (pages) => { generatedTechniqueTotalPages = pages; },
  getSelectedGeneratedTechniqueId: () => selectedGeneratedTechniqueId,
  setSelectedGeneratedTechniqueId: (id) => { selectedGeneratedTechniqueId = id; },
  getTechniqueGenerationJobs: () => techniqueGenerationJobs,
  setTechniqueGenerationJobs: (jobs) => { techniqueGenerationJobs = jobs; },
  getTechniqueGenerationJobTotalPages: () => techniqueGenerationJobTotalPages,
  setTechniqueGenerationJobTotalPages: (pages) => { techniqueGenerationJobTotalPages = pages; },
  getSelectedTechniqueGenerationJobId: () => selectedTechniqueGenerationJobId,
  setSelectedTechniqueGenerationJobId: (id) => { selectedTechniqueGenerationJobId = id; },
  generatedTechniqueBrowseEl,
  generatedTechniqueListEl,
  generatedTechniqueDetailEl,
  generatedTechniqueDetailEmptyEl,
  generatedTechniqueDetailMetaEl,
  generatedTechniqueJsonEl,
  generatedTechniquePageMetaEl,
  generatedTechniquePageNextBtn,
  generatedTechniquePagePrevBtn,
  generatedTechniquePaginationEl,
  generatedTechniqueSubtabJobsBtn,
  generatedTechniqueSubtabManualBtn,
  generatedTechniqueSubtabTechniquesBtn,
  customTechniqueFormEl,
  getGeneratedTechniqueEditor: () => generatedTechniqueEditor,
  getSelectedGeneratedTechniqueDetail: () => selectedGeneratedTechniqueDetail,
  setSelectedGeneratedTechniqueDetail: (detail) => { selectedGeneratedTechniqueDetail = detail; },
  getSelectedTechniqueGenerationJobDetail: () => selectedTechniqueGenerationJobDetail,
  setSelectedTechniqueGenerationJobDetail: (detail) => { selectedTechniqueGenerationJobDetail = detail; },
  getGeneratedTechniqueListRequestNonce: () => generatedTechniqueListRequestNonce,
  setGeneratedTechniqueListRequestNonce: (nonce) => { generatedTechniqueListRequestNonce = nonce; },
  getGeneratedTechniqueDetailRequestNonce: () => generatedTechniqueDetailRequestNonce,
  setGeneratedTechniqueDetailRequestNonce: (nonce) => { generatedTechniqueDetailRequestNonce = nonce; },
  getTechniqueGenerationJobListRequestNonce: () => techniqueGenerationJobListRequestNonce,
  setTechniqueGenerationJobListRequestNonce: (nonce) => { techniqueGenerationJobListRequestNonce = nonce; },
  getTechniqueGenerationJobDetailRequestNonce: () => techniqueGenerationJobDetailRequestNonce,
  setTechniqueGenerationJobDetailRequestNonce: (nonce) => { techniqueGenerationJobDetailRequestNonce = nonce; },
};

function buildGeneratedTechniqueListQueryParams(): URLSearchParams { return genTechBuildListQueryParams(genTechContext); }
function buildTechniqueGenerationJobListQueryParams(): URLSearchParams { return genTechBuildJobListQueryParams(genTechContext); }
function applyGeneratedTechniqueSubtabVisibility(tab: 'techniques' | 'jobs' | 'manual'): void { return genTechApplySubtabVisibility(tab, genTechContext); }
function switchGeneratedTechniqueSubtab(tab: 'techniques' | 'jobs' | 'manual'): void { return genTechSwitchSubtab(tab, genTechContext); }
async function loadCurrentGeneratedTechniqueSubtab(silent = true): Promise<void> { return genTechLoadCurrentSubtab(silent, genTechContext); }
async function loadGeneratedTechniques(silent = true): Promise<void> { return genTechLoadTechniques(silent, genTechContext); }
function renderGeneratedTechniquePanel(result?: GmGeneratedTechniqueListRes): void { return genTechRenderPanel(result, genTechContext); }
function renderGeneratedTechniqueRow(technique: GmGeneratedTechniqueSummary): string { return genTechRenderRow(technique, genTechContext); }
function renderGeneratedTechniqueDetail(): void { return genTechRenderDetail(genTechContext); }
async function loadGeneratedTechniqueDetail(id: string): Promise<void> { return genTechLoadDetail(id, genTechContext); }
function getGeneratedTechniqueGradeLabel(grade: string | null | undefined): string { return genTechGetGradeLabel(grade, genTechContext); }
async function loadTechniqueGenerationJobs(silent = true): Promise<void> { return genTechLoadJobs(silent, genTechContext); }
function renderTechniqueGenerationJobPanel(result?: GmTechniqueGenerationJobListRes): void { return genTechRenderJobPanel(result, genTechContext); }
function renderTechniqueGenerationJobRow(job: GmTechniqueGenerationJobSummary): string { return genTechRenderJobRow(job, genTechContext); }
function renderTechniqueGenerationJobDetail(): void { return genTechRenderJobDetail(genTechContext); }
async function loadTechniqueGenerationJobDetail(id: string): Promise<void> { return genTechLoadJobDetail(id, genTechContext); }
function formatTechniqueGenerationJobItemState(job: GmTechniqueGenerationJobSummary): string { return genTechFormatJobItemState(job, genTechContext); }
function formatTechniqueGenerationJobPlayerLabel(job: GmTechniqueGenerationJobSummary): string { return genTechFormatJobPlayerLabel(job, genTechContext); }
function formatTechniqueGenerationJobStatus(status: string): string { return genTechFormatJobStatus(status, genTechContext); }
function handleGeneratedTechniquePanelLoadError(error: unknown): void { return genTechHandleLoadError(error, genTechContext); }

// ===== 交易记录 tab =====
/** tradesQueryState：交易记录 tab 当前查询状态，分页 / 关键字。 */
let tradesQueryState: { page: number; pageSize: number; playerKeyword: string; itemKeyword: string } = {
  page: 1,
  pageSize: 20,
  playerKeyword: '',
  itemKeyword: '',
};

/** tradesPanelContext：trades-panel 对 gm.ts 的依赖。 */
const tradesPanelContext: TradesPanelContext = {
  GM_API_BASE_PATH,
  request,
  escapeHtml,
  getTradesQueryState: () => tradesQueryState,
  setTradesQueryState: (state) => { tradesQueryState = state; },
  tradesListEl,
  tradesMetaEl,
  tradesPageMetaEl,
  tradesPageNextBtn,
  tradesPagePrevBtn,
};

async function loadTrades(options?: { resetPage?: boolean; playerKeyword?: string; itemKeyword?: string; pageSize?: number }): Promise<void> { return tradesPanelLoadTrades(options, tradesPanelContext); }
function renderTrades(result: GmMarketTradeListRes): void { return tradesPanelRenderTrades(result, tradesPanelContext); }
function renderTradeRow(row: GmMarketTradeItem): string { return tradesPanelRenderTradeRow(row, tradesPanelContext); }
function formatTradePartyLabel(playerNo: number | null | undefined, playerName: string | null | undefined, _playerId: string): string { return tradesPanelFormatTradePartyLabel(playerNo, playerName, _playerId, tradesPanelContext); }
function formatTradePrice(value: number): string { return tradesPanelFormatTradePrice(value, tradesPanelContext); }
function formatTradeTimestamp(ms: number): string { return tradesPanelFormatTradeTimestamp(ms, tradesPanelContext); }

/** changeGmPassword：处理变更GM密码。 */
async function changeGmPassword(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const currentPassword = gmPasswordCurrentInput.value.trim();
  const newPassword = gmPasswordNextInput.value.trim();
  if (!currentPassword || !newPassword) {
    setStatus(t('gm.password.change.fill-both'), true);
    return;
  }

  gmPasswordSaveBtn.disabled = true;
  try {
    await request<BasicOkRes>(`${GM_AUTH_API_BASE_PATH}/password`, {
      method: 'POST',
      body: JSON.stringify({
        currentPassword,
        newPassword,
      } satisfies GmChangePasswordReq),
    });
    passwordInput.value = '';
    gmPasswordCurrentInput.value = '';
    gmPasswordNextInput.value = '';
    setStatus(t('gm.password.updated'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    gmPasswordSaveBtn.disabled = false;
  }
}

/** getCurrentEditorSaveSection：读取当前编辑器保存Section。 */
function getCurrentEditorSaveSection(): GmPlayerUpdateSection | null {
  return currentEditorTab === 'persisted' || currentEditorTab === 'mail' || currentEditorTab === 'risk' || currentEditorTab === 'benefits' || currentEditorTab === 'shortcuts' ? null : currentEditorTab;
}

/** buildTechniqueSaveSnapshot：构建Technique保存快照。 */
function buildTechniqueSaveSnapshot(technique: TechniqueState): TechniqueState {
  return snapshotBuildTechniqueSaveSnapshot(technique, findTechniqueCatalogEntry);
}

function buildCraftSkillSaveSnapshot(skill: PlayerState['alchemySkill'] | undefined): NonNullable<PlayerState['alchemySkill']> {
  return editorBuildCraftSkillSaveSnapshot(skill);
}

/** buildInventoryItemSaveSnapshot：构建背包物品保存快照。 */
function buildInventoryItemSaveSnapshot(item: ItemStack): ItemStack {
  return snapshotBuildInventoryItemSaveSnapshot(item, findItemCatalogEntry);
}

/** buildEquipmentItemSaveSnapshot：构建Equipment物品保存快照。 */
function buildEquipmentItemSaveSnapshot(item: ItemStack | null): ItemStack | null {
  return snapshotBuildEquipmentItemSaveSnapshot(item, findItemCatalogEntry);
}

function buildArtifactSlotSaveSnapshot(entry: PlayerState['artifacts']['slots'][number]): PlayerState['artifacts']['slots'][number] {
  return snapshotBuildArtifactSlotSaveSnapshot(entry, findItemCatalogEntry);
}

/** buildSectionSnapshot：构建Section快照。 */
function buildSectionSnapshot(section: GmPlayerUpdateSection, draft: PlayerState): GmUpdatePlayerSnapshot {
  return snapshotBuildSectionSnapshot(section, draft, findTechniqueCatalogEntry, findItemCatalogEntry, resolvePositionTargetInstanceId);
}

/** saveSelectedPlayerSections：保存Selected玩家Sections。 */
async function saveSelectedPlayerSections(sections: GmPlayerUpdateSection[], message: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected || !draftSnapshot) {
    setStatus(t('gm.player.choose'), true);
    return;
  }
  const uniqueSections = Array.from(new Set(sections));
  if (uniqueSections.length === 0) {
    setStatus(t('gm.player.no-shortcut-changes'), true);
    return;
  }
  setPendingStatus(t('gm.player.save-started', { name: selected.name, tabLabel: t('gm.editor-tab-shortcuts') }));
  for (const section of uniqueSections) {
    const snapshot = buildSectionSnapshot(section, draftSnapshot);
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, section } satisfies GmUpdatePlayerReq),
    });
  }
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  await delayRefresh(message);
}

/** setSelectedPlayerBodyTrainingLevel：处理set Selected玩家身体修炼等级。 */
async function setSelectedPlayerBodyTrainingLevel(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-body-training-level');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="set-body-training-level"]');
  const rawValue = input?.value.trim() ?? '';
  const level = Number(rawValue);

  if (!rawValue || !Number.isFinite(level) || level < 0 || !Number.isInteger(level)) {
    setStatus(t('gm.player.training-level.invalid'), true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.training-level.updating', { name: detail.name }));
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/body-training/level`, {
      method: 'POST',
      body: JSON.stringify({ level } satisfies GmSetPlayerBodyTrainingLevelReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.training-level.updated', { name: detail.name, level }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** addSelectedPlayerFoundation：处理add Selected玩家Foundation。 */
async function addSelectedPlayerFoundation(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-foundation-amount');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-foundation"]');
  const rawValue = input?.value.trim() ?? '';
  const isInteger = /^-?\d+$/.test(rawValue);
  const amount = isInteger ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!rawValue || !Number.isFinite(amount) || !isInteger) {
    setStatus(t('gm.player.foundation.invalid'), true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.foundation.updating', { name: detail.name }));
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/foundation/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerFoundationReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.foundation.updated', { name: detail.name, amount: amount > 0 ? `+${amount}` : `${amount}` }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** addSelectedPlayerCombatExp：处理add Selected玩家战斗Exp。 */
async function addSelectedPlayerCombatExp(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-combat-exp-amount');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-combat-exp"]');
  const rawValue = input?.value.trim() ?? '';
  const isInteger = /^-?\d+$/.test(rawValue);
  const amount = isInteger ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!rawValue || !Number.isFinite(amount) || !isInteger) {
    setStatus(t('gm.player.combat-exp.invalid'), true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.combat-exp.updating', { name: detail.name }));
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/combat-exp/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerCombatExpReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.combat-exp.updated', { name: detail.name, amount: amount > 0 ? `+${amount}` : `${amount}` }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function setSelectedPlayerMonthCardPool(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const totalInput = editorContentEl.querySelector<HTMLInputElement>('#benefit-month-card-total-pool');
  const remainingInput = editorContentEl.querySelector<HTMLInputElement>('#benefit-month-card-remaining-pool');
  const eternalInput = editorContentEl.querySelector<HTMLInputElement>('#benefit-eternal-enabled');
  const fixedInput = editorContentEl.querySelector<HTMLInputElement>('#benefit-daily-sign-in-fixed-merit');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="set-month-card-benefits"]');
  const totalPoolMerit = Number(totalInput?.value ?? '');
  const remainingPoolMerit = Number(remainingInput?.value ?? '');
  const dailySignInFixedMeritBonus = Number(fixedInput?.value ?? '');
  if (
    !Number.isInteger(totalPoolMerit)
    || totalPoolMerit < 0
    || !Number.isInteger(remainingPoolMerit)
    || remainingPoolMerit < 0
    || !Number.isInteger(dailySignInFixedMeritBonus)
    || dailySignInFixedMeritBonus < 0
  ) {
    setStatus('月卡功德总池、剩余功德和签到固定池必须是非负整数', true);
    return;
  }
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在修改 ${detail.name} 的功德月卡池...`);
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/month-card/pool`, {
      method: 'POST',
      body: JSON.stringify({
        totalPoolMerit,
        remainingPoolMerit,
        eternalEnabled: eternalInput?.checked === true,
        dailySignInFixedMeritBonus,
      } satisfies GmSetPlayerMonthCardPoolReq),
    });
    editorDirty = false;
    await delayRefresh(`已修改 ${detail.name} 的功德月卡池`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function activateSelectedPlayerEternalBenefit(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const countInput = editorContentEl.querySelector<HTMLInputElement>('#benefit-eternal-use-count');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="activate-eternal-benefit"]');
  const count = Number(countInput?.value ?? '');
  if (!Number.isInteger(count) || count <= 0) {
    setStatus('永恒使用次数必须是正整数', true);
    return;
  }
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在为 ${detail.name} 激活永恒权益...`);
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/month-card/eternal/activate`, {
      method: 'POST',
      body: JSON.stringify({ count } satisfies GmActivatePlayerEternalBenefitReq),
    });
    editorDirty = false;
    await delayRefresh(`已为 ${detail.name} 激活永恒权益`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function syncTechniqueEditorDraft(): boolean {
  const synced = syncVisualEditorToDraft(getEditorTabSection('techniques') ?? undefined);
  if (!synced.ok) {
    setStatus(synced.message, true);
    return false;
  }
  return true;
}

function rerenderTechniqueEditor(): void {
  lastEditorStructureKey = null;
  if (state) {
    renderEditor(state);
  }
}

function clearTechniqueCandidateSelection(): void {
  selectedTechniqueCandidateIds.clear();
  selectedGeneratedTechniqueCandidateById.clear();
}

function updateGeneratedCandidateSelectionCache(techId: string, selected: boolean): void {
  if (!selected) {
    selectedGeneratedTechniqueCandidateById.delete(techId);
    return;
  }
  const summary = generatedTechniqueCandidates.find((entry) => entry.id === techId);
  if (summary) {
    selectedGeneratedTechniqueCandidateById.set(techId, summary);
  }
}

function toggleTechniqueCandidateSelection(techId: string, selected: boolean): void {
  if (selected) {
    selectedTechniqueCandidateIds.add(techId);
  } else {
    selectedTechniqueCandidateIds.delete(techId);
  }
  if (currentTechniqueCandidateSource === 'generated') {
    updateGeneratedCandidateSelectionCache(techId, selected);
  }
}

function handleTechniqueFilterChange(target: HTMLInputElement | HTMLSelectElement): boolean {
  const filter = target.dataset.techniqueFilter;
  if (!filter) {
    return false;
  }

  if (filter === 'source') {
    currentTechniqueCandidateSource = (target.value as GmTechniqueCandidateSource) || 'system';
    currentTechniqueCandidatePage = 1;
    clearTechniqueCandidateSelection();
    patchTechniqueManagerBodyFromDraft();
    if (currentTechniqueCandidateSource === 'generated') {
      loadGeneratedTechniqueCandidates(true).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
      });
    }
    return true;
  }

  if (filter === 'category') {
    currentTechniqueCategoryFilter = (target.value as GmTechniqueCategoryFilter) || 'all';
  } else if (filter === 'grade') {
    currentTechniqueGradeFilter = (target.value as GmTechniqueGradeFilter) || 'all';
  } else if (filter === 'realmLv') {
    currentTechniqueRealmLvFilter = target.value.trim();
  } else if (filter === 'keyword') {
    currentTechniqueSearchQuery = target.value;
  } else if (filter === 'pageSize') {
    currentTechniquePageSize = normalizeTechniquePageSize(target.value);
  } else if (filter === 'randomCount') {
    currentTechniqueRandomPickCount = Math.max(1, Math.trunc(Number(target.value) || 1));
  }

  currentTechniqueCandidatePage = 1;
  currentTechniqueLearnedPage = 1;
  if (currentTechniqueCandidateSource === 'generated') {
    scheduleGeneratedTechniqueCandidateLoad();
  }
  patchTechniqueManagerListsFromDraft();
  return true;
}

function selectCurrentTechniqueCandidatePage(): void {
  if (!draftSnapshot) {
    return;
  }
  const pageData = getTechniqueCandidatePageData(ensureArray(draftSnapshot.techniques));
  const selectablePageItems = pageData.items.filter((entry) => !entry.disabledReason);
  const allSelected = selectablePageItems.length > 0 && selectablePageItems.every((entry) => selectedTechniqueCandidateIds.has(entry.techId));
  for (const candidate of selectablePageItems) {
    toggleTechniqueCandidateSelection(candidate.techId, !allSelected);
  }
  patchTechniqueManagerListsFromDraft();
}

function selectRandomTechniqueCandidates(): void {
  if (!draftSnapshot) {
    return;
  }
  const learnedIds = getLearnedTechniqueIdSet(ensureArray(draftSnapshot.techniques));
  const candidates = getFilteredSystemTechniqueCandidates(learnedIds)
    .filter((candidate) => !candidate.learned);
  if (candidates.length === 0) {
    setStatus('当前筛选条件下没有可随机添加的系统功法。', true);
    return;
  }
  const shuffled = candidates.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  clearTechniqueCandidateSelection();
  for (const candidate of shuffled.slice(0, Math.min(currentTechniqueRandomPickCount, shuffled.length))) {
    selectedTechniqueCandidateIds.add(candidate.techId);
  }
  patchTechniqueManagerListsFromDraft();
}

function addSelectedTechniqueCandidatesToDraft(): void {
  if (!syncTechniqueEditorDraft() || !draftSnapshot) {
    return;
  }
  const selectedIds = Array.from(selectedTechniqueCandidateIds);
  if (selectedIds.length === 0) {
    setStatus('请先勾选要添加的功法。', true);
    return;
  }
  const learnedIds = getLearnedTechniqueIdSet(ensureArray(draftSnapshot.techniques));
  let added = 0;
  let disabledSkipped = 0;
  mutateDraft((draft) => {
    for (const techId of selectedIds) {
      if (!techId || learnedIds.has(techId)) {
        continue;
      }
      if (currentTechniqueCandidateSource === 'generated') {
        const summary = selectedGeneratedTechniqueCandidateById.get(techId)
          ?? generatedTechniqueCandidates.find((entry) => entry.id === techId);
        if (!summary) {
          continue;
        }
        if (typeof summary.playerAddDisabledReason === 'string' && summary.playerAddDisabledReason.trim().length > 0) {
          disabledSkipped += 1;
          continue;
        }
        draft.techniques.push(createTechniqueFromGeneratedSummary(summary));
      } else {
        if (!findTechniqueCatalogEntry(techId)) {
          continue;
        }
        draft.techniques.push(createTechniqueFromCatalog(techId));
      }
      learnedIds.add(techId);
      added += 1;
    }
    if (!draft.cultivatingTechId && draft.techniques[0]) {
      draft.cultivatingTechId = draft.techniques[0].techId;
    }
  });
  clearTechniqueCandidateSelection();
  patchTechniqueManagerListsFromDraft();
  setStatus(added > 0
    ? `已加入 ${added} 个功法到草稿，保存功法标签后生效。`
    : disabledSkipped > 0
      ? '选中的自创功法需要先迁移旧版AI术法草稿，暂未加入。'
      : '选中功法都已经学会或不在当前候选源中。',
  added === 0);
}

function removeTechniqueIdsFromDraft(techIds: Set<string>): number {
  if (techIds.size === 0) {
    return 0;
  }
  let removed = 0;
  mutateDraft((draft) => {
    const before = draft.techniques.length;
    draft.techniques = ensureArray(draft.techniques).filter((technique) => !techIds.has(technique.techId));
    removed = before - draft.techniques.length;
    if (draft.cultivatingTechId && techIds.has(draft.cultivatingTechId)) {
      draft.cultivatingTechId = undefined;
    }
    draft.autoBattleSkills = ensureArray(draft.autoBattleSkills).filter((entry) => !techIds.has(entry.skillId));
  });
  return removed;
}

function removeSelectedTechniqueCandidatesFromDraft(): void {
  if (!syncTechniqueEditorDraft()) {
    return;
  }
  const removed = removeTechniqueIdsFromDraft(new Set(selectedTechniqueCandidateIds));
  clearTechniqueCandidateSelection();
  patchTechniqueManagerListsFromDraft();
  setStatus(removed > 0 ? `已从草稿移除 ${removed} 个功法，保存功法标签后生效。` : '选中项里没有当前已学功法。', removed === 0);
}

function selectCurrentLearnedTechniquePage(): void {
  if (!draftSnapshot) {
    return;
  }
  const pageData = paginateTechniqueEntries(
    getFilteredLearnedTechniques(ensureArray(draftSnapshot.techniques)),
    currentTechniqueLearnedPage,
    currentTechniquePageSize,
  );
  const allSelected = pageData.items.length > 0 && pageData.items.every((entry) => selectedLearnedTechniqueIds.has(entry.technique.techId));
  for (const entry of pageData.items) {
    if (allSelected) {
      selectedLearnedTechniqueIds.delete(entry.technique.techId);
    } else {
      selectedLearnedTechniqueIds.add(entry.technique.techId);
    }
  }
  patchTechniqueManagerListsFromDraft();
}

function removeSelectedLearnedTechniquesFromDraft(): void {
  if (!syncTechniqueEditorDraft()) {
    return;
  }
  const removed = removeTechniqueIdsFromDraft(new Set(selectedLearnedTechniqueIds));
  selectedLearnedTechniqueIds.clear();
  patchTechniqueManagerListsFromDraft();
  setStatus(removed > 0 ? `已从草稿移除 ${removed} 个已学功法，保存功法标签后生效。` : '没有移除任何已学功法。', removed === 0);
}

function maxSelectedLearnedTechniquesInDraft(): void {
  if (!syncTechniqueEditorDraft() || !draftSnapshot) {
    return;
  }
  const selectedIds = new Set(selectedLearnedTechniqueIds);
  if (selectedIds.size === 0) {
    setStatus('请先勾选要满级的已学功法。', true);
    return;
  }
  let changedCount = 0;
  mutateDraft((draft) => {
    draft.techniques = ensureArray(draft.techniques).map((technique) => {
      if (!selectedIds.has(technique.techId)) {
        return technique;
      }
      changedCount += 1;
      return buildMaxLevelTechniqueState(technique);
    });
  });
  setStatus(changedCount > 0 ? `已把 ${changedCount} 个功法设为满级草稿，保存功法标签后生效。` : '没有匹配到可满级的已学功法。', changedCount === 0);
}

function handleTechniqueEditorAction(action: string, trigger: HTMLElement): boolean {
  switch (action) {
    case 'switch-technique-subtab': {
      if (!syncTechniqueEditorDraft()) return true;
      const subtab = trigger.dataset.techniqueSubtab as GmTechniqueEditorSubtab | undefined;
      if (!subtab) return true;
      currentTechniqueEditorSubtab = subtab;
      patchTechniqueManagerBodyFromDraft();
      if (subtab === 'manage' && currentTechniqueCandidateSource === 'generated') {
        loadGeneratedTechniqueCandidates(true).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
        });
      }
      return true;
    }
    case 'refresh-generated-technique-candidates':
      loadGeneratedTechniqueCandidates(false).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
      });
      return true;
    case 'technique-candidate-prev':
      if (currentTechniqueCandidatePage > 1) {
        currentTechniqueCandidatePage -= 1;
        if (currentTechniqueCandidateSource === 'generated') {
          loadGeneratedTechniqueCandidates(true).catch((error: unknown) => setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true));
        } else {
          patchTechniqueManagerListsFromDraft();
        }
      }
      return true;
    case 'technique-candidate-next':
      currentTechniqueCandidatePage += 1;
      if (currentTechniqueCandidateSource === 'generated') {
        loadGeneratedTechniqueCandidates(true).catch((error: unknown) => setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true));
      } else {
        patchTechniqueManagerListsFromDraft();
      }
      return true;
    case 'technique-learned-prev':
      currentTechniqueLearnedPage = Math.max(1, currentTechniqueLearnedPage - 1);
      patchTechniqueManagerListsFromDraft();
      return true;
    case 'technique-learned-next':
      currentTechniqueLearnedPage += 1;
      patchTechniqueManagerListsFromDraft();
      return true;
    case 'select-page-technique-candidates':
      selectCurrentTechniqueCandidatePage();
      return true;
    case 'clear-technique-candidate-selection':
      clearTechniqueCandidateSelection();
      patchTechniqueManagerListsFromDraft();
      return true;
    case 'random-select-technique-candidates':
      selectRandomTechniqueCandidates();
      return true;
    case 'add-selected-techniques':
      addSelectedTechniqueCandidatesToDraft();
      return true;
    case 'remove-selected-technique-candidates':
      removeSelectedTechniqueCandidatesFromDraft();
      return true;
    case 'select-page-learned-techniques':
      selectCurrentLearnedTechniquePage();
      return true;
    case 'clear-learned-technique-selection':
      selectedLearnedTechniqueIds.clear();
      patchTechniqueManagerListsFromDraft();
      return true;
    case 'remove-selected-learned-techniques':
      removeSelectedLearnedTechniquesFromDraft();
      return true;
    case 'max-selected-learned-techniques':
      maxSelectedLearnedTechniquesInDraft();
      return true;
    default:
      return false;
  }
}

async function runPlayerTechniqueShortcut(
  action: 'grant-all-unlearned-technique-books' | 'max-all-techniques' | 'learn-all-techniques' | 'remove-all-techniques',
): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) {
    setStatus(t('gm.player.no-editable'), true);
    return;
  }

  assertTrustedEditorCatalog('快捷操作：');

  if (action === 'grant-all-unlearned-technique-books') {
    const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
    const existingInventoryItemIds = new Set(ensureArray(draftSnapshot.inventory.items).map((item) => item.itemId));
    const bookItemIds = editorCatalog!.items
      .filter((item) => item.type === 'skill_book')
      .map((item) => item.itemId)
      .filter((itemId) => {
        const techniqueId = resolveTechniqueIdFromBookItemId(itemId);
        return !!techniqueId && !learnedTechniqueIds.has(techniqueId) && !existingInventoryItemIds.has(itemId);
      });
    if (bookItemIds.length === 0) {
      setStatus(t('gm.player.no-unlearned-technique-books'));
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.inventory.items.push(...bookItemIds.map((itemId) => createItemFromCatalog(itemId)));
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['items'], t('gm.player.no-unlearned-technique-books.sent', { count: bookItemIds.length }));
    return;
  }

  if (action === 'max-all-techniques') {
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus(t('gm.player.no-learned-techniques'));
      return;
    }
    const upgradableCount = techniques.filter((technique) => technique.level < getTechniqueTemplateMaxLevel(technique) || technique.expToNext !== 0).length;
    if (upgradableCount === 0) {
      setStatus(t('gm.player.techniques-maxed'));
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.techniques = ensureArray(draft.techniques).map((technique) => buildMaxLevelTechniqueState(technique));
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['techniques'], t('gm.player.techniques-maxed.sent', { count: techniques.length }));
    return;
  }

  if (action === 'remove-all-techniques') {
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus(t('gm.player.no-removable-techniques'));
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.techniques = [];
      draft.cultivatingTechId = undefined;
      draft.autoBattleSkills = [];
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['techniques'], t('gm.player.techniques-removed', { count: techniques.length }));
    return;
  }

  const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
  const missingTechniqueIds = editorCatalog!.techniques
    .map((technique) => technique.id)
    .filter((techId) => !learnedTechniqueIds.has(techId));
  if (missingTechniqueIds.length === 0) {
    setStatus(t('gm.player.learned-all-techniques'));
    return;
  }
  const changed = mutateDraft((draft) => {
    draft.techniques.push(...missingTechniqueIds.map((techId) => createTechniqueFromCatalog(techId)));
    if (!draft.cultivatingTechId && draft.techniques[0]) {
      draft.cultivatingTechId = draft.techniques[0].techId;
    }
  });
  if (!changed) {
    return;
  }
  await saveSelectedPlayerSections(['techniques'], t('gm.player.learned-all-techniques.sent', { count: missingTechniqueIds.length }));
}

/** runPlayerItemShortcut：执行玩家物品类快捷操作。 */
async function runPlayerItemShortcut(action: 'grant-all-consumables' | 'grant-all-equipment'): Promise<void> {
  if (!draftSnapshot) {
    setStatus(t('gm.player.no-editable'), true);
    return;
  }

  assertTrustedEditorCatalog('快捷操作：');

  const targetType = action === 'grant-all-consumables' ? 'consumable' : 'equipment';
  const targetCount = action === 'grant-all-consumables' ? 999 : 1;
  const catalogItems = editorCatalog!.items
    .filter((item) => item.type === targetType)
    .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
  if (catalogItems.length === 0) {
    setStatus(action === 'grant-all-consumables' ? t('gm.player.no-consumable-template') : t('gm.player.no-equipment-template'));
    return;
  }

  const currentItems = ensureArray(draftSnapshot.inventory.items);
  const currentItemById = new Map(currentItems.map((item) => [item.itemId, item]));
  const itemsToAdd = catalogItems.filter((item) => !currentItemById.has(item.itemId));
  const consumablesToUpdate = action === 'grant-all-consumables'
    ? catalogItems.filter((item) => {
        const existing = currentItemById.get(item.itemId);
        return existing && (existing.count ?? 0) < targetCount;
      })
    : [];
  if (itemsToAdd.length === 0 && consumablesToUpdate.length === 0) {
    setStatus(action === 'grant-all-consumables' ? t('gm.player.inventory-full-consumables') : t('gm.player.inventory-full-equipment'));
    return;
  }

  const changed = mutateDraft((draft) => {
    const inventoryItems = ensureArray(draft.inventory.items);
    const inventoryItemById = new Map(inventoryItems.map((item) => [item.itemId, item]));
    for (const catalogItem of consumablesToUpdate) {
      const existing = inventoryItemById.get(catalogItem.itemId);
      if (existing) {
        existing.count = targetCount;
      }
    }
    for (const catalogItem of itemsToAdd) {
      const nextItem = createItemFromCatalog(catalogItem.itemId, targetCount);
      inventoryItems.push(nextItem);
      inventoryItemById.set(catalogItem.itemId, nextItem);
    }
    draft.inventory.items = inventoryItems;
    draft.inventory.capacity = Math.max(draft.inventory.capacity ?? 0, inventoryItems.length);
  });
  if (!changed) {
    return;
  }
  const label = action === 'grant-all-consumables' ? '消耗品' : '装备';
  const detail = action === 'grant-all-consumables'
    ? `新增 ${itemsToAdd.length} 种，补足 ${consumablesToUpdate.length} 种到 999 个`
    : `新增 ${itemsToAdd.length} 件`;
  await saveSelectedPlayerSections(['items'], t('gm.player.inventory-updated', { label, detail }));
}

/** openSelectedPlayerMailTab：打开Selected玩家邮件Tab。 */
function openSelectedPlayerMailTab(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!selectedPlayerId) {
    setStatus(t('gm.player.choose'), true);
    return;
  }
  if (currentTab !== 'players') {
    switchTab('players');
  }
  switchEditorTab('mail');
}

/** refreshSelectedPlayer：处理refresh Selected玩家。 */
async function refreshSelectedPlayer(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  if (editorDirty && !window.confirm(t('gm.refresh.confirm'))) {
    return;
  }

  refreshPlayerBtn.disabled = true;
  /** selectedPlayerDetail：selected玩家详情。 */
  selectedPlayerDetail = null;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = selected.id;
  /** draftSnapshot：draft快照。 */
  draftSnapshot = null;
  /** draftSourcePlayerId：draft来源玩家ID。 */
  draftSourcePlayerId = null;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  clearEditorRenderCache();
  render();

  try {
    await loadPlayerList(true, true, true);
    setStatus(t('gm.player.refreshed', { name: selected.name }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.detail-load-failed'), true);
  } finally {
    refreshPlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayer：保存Selected玩家。 */
async function saveSelectedPlayer(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.choose'), true);
    return;
  }
  const section = getCurrentEditorSaveSection();
  if (!section) {
    setStatus(
      currentEditorTab === 'mail'
        ? t('gm.player.section.mail-cannot-save')
        : t('gm.player.section.persisted-cannot-save'),
      true,
    );
    return;
  }
  if ((section === 'buffs' || section === 'techniques' || section === 'items' || section === 'quests') && !hasServerEditorCatalog()) {
    setStatus(t('gm.player.catalog.save-paused', { tabLabel: getEditorTabLabel(section) }), true);
    return;
  }

  const synced = syncVisualEditorToDraft(getEditorTabSection(section) ?? undefined);
  if (!synced.ok || !draftSnapshot) {
    setStatus(synced.ok ? t('gm.player.no-save-content') : synced.message, true);
    return;
  }

  savePlayerBtn.disabled = true;
  try {
    setPendingStatus(t('gm.player.save-started', { name: selected.name, tabLabel: getEditorTabLabel(section) }));
    const snapshot = buildSectionSnapshot(section, draftSnapshot);
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, section } satisfies GmUpdatePlayerReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.save-done', { name: selected.name, tabLabel: getEditorTabLabel(section) }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    savePlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayerPassword：保存Selected玩家密码。 */
async function saveSelectedPlayerPassword(forcedPassword?: string, action = 'save-player-password'): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.password.no-target'), true);
    return;
  }

  const passwordInput = editorContentEl.querySelector<HTMLInputElement>('#player-password-input');
  const button = editorContentEl.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  const newPassword = typeof forcedPassword === 'string' ? forcedPassword : (passwordInput?.value.trim() ?? '');

  if (!newPassword) {
    setStatus(t('gm.player.password.fill-new'), true);
    if (passwordInput) {
      passwordInput.focus();
    }
    return;
  }

  // 显式标记保存中状态：按钮置灰 + “正在保存…” 文案 + 输入框只读，避免重复点击。
  // 使用 dataset 记录原始文案，恢复时还原（即使 i18n 后续变更也不会丢失原文）。
  const originalLabel = button?.textContent ?? '';
  if (button) {
    button.dataset.originalLabel = originalLabel;
    button.dataset.savingState = 'pending';
    button.textContent = t('gm.player.password.saving-button');
    button.disabled = true;
  }
  if (passwordInput) {
    passwordInput.readOnly = true;
  }
  try {
    setPendingStatus(t('gm.player.password.updating', { username: detail.account.username }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword } satisfies GmUpdateManagedPlayerPasswordReq),
    });
    if (passwordInput) {
      passwordInput.value = '';
    }
    setStatus(forcedPassword
      ? `已将账号 ${detail.account.username} 的密码重置为 ${GM_PLAYER_QUICK_RESET_PASSWORD}`
      : t('gm.player.password.updated', { username: detail.account.username }));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : t('gm.request.failed');
    setStatus(t('gm.player.password.failed', { message }), true);
  } finally {
    if (button) {
      button.disabled = false;
      const restoreLabel = button.dataset.originalLabel || t('gm.player.password.save-button');
      button.textContent = restoreLabel;
      delete button.dataset.savingState;
      delete button.dataset.originalLabel;
    }
    if (passwordInput) {
      passwordInput.readOnly = false;
    }
  }
}

/** saveSelectedPlayerAccount：保存Selected玩家账号。 */
async function saveSelectedPlayerAccount(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.account.no-target'), true);
    return;
  }

  const accountInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-username');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="save-player-account"]');
  const username = accountInput?.value.trim() ?? '';

  if (!username) {
    setStatus(t('gm.player.account.fill'), true);
    return;
  }
  if (username === detail.account.username) {
    setStatus(t('gm.player.account.unchanged'));
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.account.updating', { username: detail.account.username }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/account`, {
      method: 'PUT',
      body: JSON.stringify({ username } satisfies GmUpdateManagedPlayerAccountReq),
    });
    await delayRefresh(t('gm.player.account.updated', { oldUsername: detail.account.username, newUsername: username }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** banSelectedPlayerAccount：封禁Selected玩家账号。 */
async function banSelectedPlayerAccount(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.account.ban.no-target'), true);
    return;
  }
  const reasonInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-ban-reason');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="ban-player-account"]');
  const reason = reasonInput?.value.trim() ?? '';
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.account.ban.updating', { username: detail.account.username }));
    await request<{
      ok: true;
    }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason } satisfies GmBanManagedPlayerReq),
    });
    await delayRefresh(t('gm.player.account.banned', { username: detail.account.username }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.account.ban.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** unbanSelectedPlayerAccount：解封Selected玩家账号。 */
async function unbanSelectedPlayerAccount(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.account.unban.no-target'), true);
    return;
  }
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="unban-player-account"]');
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.account.unban.updating', { username: detail.account.username }));
    await request<{
      ok: true;
    }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/unban`, {
      method: 'POST',
    });
    await delayRefresh(t('gm.player.account.unbanned', { username: detail.account.username }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.account.unban.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** resetSelectedPlayer：重置Selected玩家。 */
async function resetSelectedPlayer(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.reset.no-target'), true);
    return;
  }

  resetPlayerBtn.disabled = true;
  try {
    setPendingStatus(t('gm.player.reset.updating', { name: selected.name }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}/reset`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.reset.done', { name: selected.name }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.reset.failed'), true);
  } finally {
    resetPlayerBtn.disabled = false;
  }
}

/** resetSelectedPlayerHeavenGate：重置Selected玩家Heaven关卡。 */
async function resetSelectedPlayerHeavenGate(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  resetHeavenGateBtn.disabled = true;
  try {
    setPendingStatus(t('gm.player.heaven-gate.reset.updating', { name: selected.name }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}/heaven-gate/reset`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.heaven-gate.reset.done', { name: selected.name }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.heaven-gate.reset.failed'), true);
  } finally {
    resetHeavenGateBtn.disabled = false;
  }
}

/** adminShortcutsContext：admin-shortcuts 对 gm.ts 的依赖。 */
const adminShortcutsContext: AdminShortcutsContext = {
  getToken: () => token,
  GM_API_BASE_PATH,
  request,
  setStatus,
  setPendingStatus,
  t,
  delayRefresh,
  copyTextToClipboard,
  formatBytes,
  formatSignedBytes,
  getSelectedPlayer,
  loadState,
  loadRuntimeFlags,
  getState: () => state,
  getNetworkStatsActivationPending: () => networkStatsActivationPending,
  setNetworkStatsActivationPending: (value) => { networkStatsActivationPending = value; },
  getEditorDirty: () => editorDirty,
  setEditorDirty: (value) => { editorDirty = value; },
  spawnCountInput,
  getLastNetworkInStructureKey: () => lastNetworkInStructureKey,
  setLastNetworkInStructureKey: (value) => { lastNetworkInStructureKey = value; },
  getLastNetworkOutStructureKey: () => lastNetworkOutStructureKey,
  setLastNetworkOutStructureKey: (value) => { lastNetworkOutStructureKey = value; },
  removeBotBtn,
  resetCpuStatsBtn,
  resetNetworkStatsBtn,
  resetPathfindingStatsBtn,
  toggleNetworkPayloadCaptureBtn,
  triggerManualGcBtn,
  writeHeapSnapshotBtn,
  copyHeapSnapshotSummaryBtn,
  copyLatestHeapSnapshotSummaryBtn,
  heapSnapshotMetaEl,
};

async function removeSelectedBot(): Promise<void> { return adminRemoveSelectedBot(adminShortcutsContext); }
async function spawnBots(): Promise<void> { return adminSpawnBots(adminShortcutsContext); }
async function removeAllBots(): Promise<void> { return adminRemoveAllBots(adminShortcutsContext); }
async function returnAllPlayersToDefaultSpawn(): Promise<void> { return adminReturnAllPlayersToDefaultSpawn(adminShortcutsContext); }
async function cleanupAllPlayersInvalidItems(): Promise<void> { return adminCleanupAllPlayersInvalidItems(adminShortcutsContext); }
async function migrateAllPlayersRecoveryPills(): Promise<void> { return adminMigrateAllPlayersRecoveryPills(adminShortcutsContext); }
async function repairMarketStorageItemIds(): Promise<void> { return adminRepairMarketStorageItemIds(adminShortcutsContext); }
async function migrateAiArtsStrengthDraftsV1ToV2(): Promise<void> { return adminMigrateAiArtsStrengthDraftsV1ToV2(adminShortcutsContext); }
async function deleteEmptyCustomTechniqueBooks(): Promise<void> { return adminDeleteEmptyCustomTechniqueBooks(adminShortcutsContext); }
async function recoverEmptyCustomTechniqueBooks(): Promise<void> { return adminRecoverEmptyCustomTechniqueBooks(adminShortcutsContext); }
async function repairQuestProgressPayloads(): Promise<void> { return adminRepairQuestProgressPayloads(adminShortcutsContext); }
async function refreshOnlineTechniqueTemplates(): Promise<void> { return adminRefreshOnlineTechniqueTemplates(adminShortcutsContext); }
async function refillOnlineAndOfflineHangingPlayersStamina(): Promise<void> { return adminRefillOnlineAndOfflineHangingPlayersStamina(adminShortcutsContext); }
async function cleanupAbnormalTemporaryTiles(): Promise<void> { return adminCleanupAbnormalTemporaryTiles(adminShortcutsContext); }
async function compensateAllPlayersCombatExp(): Promise<void> { return adminCompensateAllPlayersCombatExp(adminShortcutsContext); }
async function compensateAllPlayersFoundation(): Promise<void> { return adminCompensateAllPlayersFoundation(adminShortcutsContext); }
async function resetNetworkStats(): Promise<void> { return adminResetNetworkStats(adminShortcutsContext); }
async function toggleNetworkPayloadCapture(): Promise<void> { return adminToggleNetworkPayloadCapture(adminShortcutsContext); }
async function activateNetworkStats(): Promise<void> { return adminActivateNetworkStats(adminShortcutsContext); }
async function ensureNetworkStatsActive(): Promise<void> { return adminEnsureNetworkStatsActive(adminShortcutsContext); }
async function resetCpuStats(): Promise<void> { return adminResetCpuStats(adminShortcutsContext); }
async function resetPathfindingStats(): Promise<void> { return adminResetPathfindingStats(adminShortcutsContext); }
async function triggerManualGc(): Promise<void> { return adminTriggerManualGc(adminShortcutsContext); }
async function writeHeapSnapshot(): Promise<void> { return adminWriteHeapSnapshot(adminShortcutsContext); }
async function writeAndCopyHeapSnapshotSummary(): Promise<void> { return adminWriteAndCopyHeapSnapshotSummary(adminShortcutsContext); }
async function copyLatestHeapSnapshotSummary(): Promise<void> { return adminCopyLatestHeapSnapshotSummary(adminShortcutsContext); }

/** handleEditorAction：处理编辑器动作。 */
function handleEditorAction(action: string, trigger: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) return;

  const index = Number(trigger.dataset.index ?? '-1');
  const slot = trigger.dataset.slot as EquipSlot | undefined;

  switch (action) {
    case 'add-bonus':
      mutateDraft((draft) => {
        draft.bonuses.push({ source: '', attrs: {}, stats: {}, meta: {} });
      });
      break;
    case 'remove-bonus':
      mutateDraft((draft) => removeArrayIndex(draft, 'bonuses', index));
      break;
    case 'add-buff':
      if (!hasServerEditorCatalog()) {
        setStatus(t('gm.editor.catalog.buff-unavailable'), true);
        return;
      }
      mutateDraft((draft) => {
        draft.temporaryBuffs = ensureArray(draft.temporaryBuffs);
        draft.temporaryBuffs.push(createDefaultBuff());
      });
      break;
    case 'remove-buff':
      mutateDraft((draft) => {
        draft.temporaryBuffs = ensureArray(draft.temporaryBuffs);
        draft.temporaryBuffs.splice(index, 1);
      });
      break;
    case 'add-inventory-item':
      mutateDraft((draft) => draft.inventory.items.push(createDefaultItem()));
      break;
    case 'add-inventory-item-from-catalog': {
      if (!hasServerEditorCatalog()) {
        setStatus(t('gm.editor.catalog.item-unavailable'), true);
        return;
      }
      const itemId = readCatalogSelectValue('inventory-item');
      if (!itemId) {
        setStatus(t('gm.editor.catalog.choose-item-template'), true);
        return;
      }
      mutateDraft((draft) => {
        draft.inventory.items.push(createItemFromCatalog(itemId));
      });
      break;
    }
    case 'remove-inventory-item':
      mutateDraft((draft) => draft.inventory.items.splice(index, 1));
      break;
    case 'create-equip':
      if (!slot) return;
      mutateDraft((draft) => {
        draft.equipment[slot] = createDefaultItem(slot);
      });
      break;
    case 'create-equip-from-catalog':
      if (!slot) return;
      {
        if (!hasServerEditorCatalog()) {
          setStatus(t('gm.editor.catalog.equipment-unavailable'), true);
          return;
        }
        const itemId = readCatalogSelectValue('equipment', slot);
        if (!itemId) {
          setStatus(t('gm.editor.catalog.choose-equipment-template'), true);
          return;
        }
        mutateDraft((draft) => {
          draft.equipment[slot] = createItemFromCatalog(itemId);
        });
      }
      break;
    case 'clear-equip':
      if (!slot) return;
      mutateDraft((draft) => {
        draft.equipment[slot] = null;
      });
      break;
    case 'create-artifact-from-catalog': {
      if (!Number.isInteger(index) || index < 0) return;
      if (!hasServerEditorCatalog()) {
        setStatus(t('gm.editor.catalog.equipment-unavailable'), true);
        return;
      }
      const itemId = readCatalogSelectValue('artifact', undefined, index);
      if (!itemId) {
        setStatus('请选择法宝模板', true);
        return;
      }
      mutateDraft((draft) => {
        draft.artifacts = normalizeGmArtifactState(draft.artifacts);
        if (draft.artifacts.slots[index]) {
          draft.artifacts.slots[index].item = createItemFromCatalog(itemId);
        }
      });
      break;
    }
    case 'clear-artifact':
      if (!Number.isInteger(index) || index < 0) return;
      mutateDraft((draft) => {
        draft.artifacts = normalizeGmArtifactState(draft.artifacts);
        if (draft.artifacts.slots[index]) {
          draft.artifacts.slots[index].item = null;
        }
      });
      break;
    case 'add-auto-skill':
      mutateDraft((draft) => {
        draft.autoBattleSkills.push({ skillId: '', enabled: true } satisfies AutoBattleSkillConfig);
      });
      break;
    case 'remove-auto-skill':
      mutateDraft((draft) => draft.autoBattleSkills.splice(index, 1));
      break;
    case 'add-technique':
      mutateDraft((draft) => draft.techniques.push(createDefaultTechnique()));
      break;
    case 'add-technique-from-catalog': {
      if (!hasServerEditorCatalog()) {
        setStatus(t('gm.editor.catalog.technique-unavailable'), true);
        return;
      }
      const techId = readCatalogSelectValue('technique');
      if (!techId) {
        setStatus(t('gm.editor.catalog.choose-technique-template'), true);
        return;
      }
      mutateDraft((draft) => {
        draft.techniques.push(createTechniqueFromCatalog(techId));
        if (!draft.cultivatingTechId) {
          draft.cultivatingTechId = techId;
        }
      });
      break;
    }
    case 'remove-technique':
      mutateDraft((draft) => draft.techniques.splice(index, 1));
      break;
    case 'add-quest':
      mutateDraft((draft) => draft.quests.push(createDefaultQuest()));
      break;
    case 'remove-quest':
      mutateDraft((draft) => draft.quests.splice(index, 1));
      break;
  }
}

playerListEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-player-id]');
  const playerId = button?.dataset.playerId;
  if (!playerId || playerId === selectedPlayerId) return;
  if (editorDirty && !window.confirm(t('gm.player.switch.confirm'))) {
    return;
  }
  /** selectedPlayerId：selected玩家ID。 */
  selectedPlayerId = playerId;
  /** selectedPlayerDetail：selected玩家详情。 */
  selectedPlayerDetail = null;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = playerId;
  /** draftSnapshot：draft快照。 */
  draftSnapshot = null;
  /** draftSourcePlayerId：draft来源玩家ID。 */
  draftSourcePlayerId = null;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  currentInventorySearchQuery = '';
  currentTechniqueSearchQuery = '';
  currentTechniqueRealmLvFilter = '';
  currentTechniqueCandidatePage = 1;
  currentTechniqueLearnedPage = 1;
  clearTechniqueCandidateSelection();
  selectedLearnedTechniqueIds.clear();
  render();
  loadSelectedPlayerDetail(playerId, true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.detail-load-failed'), true);
  });
});

editorContentEl.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  const action = trigger?.dataset.action;
  const reasonPreset = (event.target as HTMLElement).closest<HTMLElement>('[data-ban-reason-preset]');
  if (reasonPreset) {
    const input = editorContentEl.querySelector<HTMLInputElement>('#player-account-ban-reason');
    if (input) {
      input.value = reasonPreset.dataset.banReasonPreset ?? '';
      input.focus();
    }
    return;
  }
  if (!action || !trigger) return;
  if (action === 'add-direct-mail-attachment') {
    addMailAttachment('direct');
    return;
  }
  if (action === 'remove-direct-mail-attachment') {
    removeMailAttachment('direct', Number(trigger.dataset.mailAttachmentIndex));
    return;
  }
  if (action === 'send-direct-mail') {
    sendDirectMail().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'save-player-account') {
    saveSelectedPlayerAccount().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'save-player-password') {
    saveSelectedPlayerPassword().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'reset-player-password-default') {
    saveSelectedPlayerPassword(GM_PLAYER_QUICK_RESET_PASSWORD, 'reset-player-password-default').catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'ban-player-account') {
    banSelectedPlayerAccount().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'unban-player-account') {
    unbanSelectedPlayerAccount().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'set-body-training-level') {
    setSelectedPlayerBodyTrainingLevel().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'add-foundation') {
    addSelectedPlayerFoundation().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'add-combat-exp') {
    addSelectedPlayerCombatExp().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'set-month-card-benefits') {
    setSelectedPlayerMonthCardPool().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'activate-eternal-benefit') {
    activateSelectedPlayerEternalBenefit().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (
    action === 'grant-all-unlearned-technique-books'
    || action === 'max-all-techniques'
    || action === 'learn-all-techniques'
    || action === 'remove-all-techniques'
  ) {
    runPlayerTechniqueShortcut(action).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (handleTechniqueEditorAction(action, trigger)) {
    return;
  }
  if (action === 'grant-all-consumables' || action === 'grant-all-equipment') {
    runPlayerItemShortcut(action).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  handleEditorAction(action, trigger);
});

editorContentEl.addEventListener('input', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    if (target instanceof HTMLInputElement && target.dataset.inventorySearch !== undefined) {
      currentInventorySearchQuery = target.value;
      patchInventoryListFromDraft();
      return;
    }
    if (
      (target instanceof HTMLInputElement || target instanceof HTMLSelectElement)
      && target.dataset.techniqueFilter !== undefined
    ) {
      handleTechniqueFilterChange(target);
      return;
    }
    const binding = target.dataset.mailBind;
    if (!binding) {
      return;
    }
    const [scope, ...rest] = binding.split('.');
    if ((scope === 'direct' || scope === 'shortcut') && rest.length > 0) {
      updateMailDraftValue(scope, rest.join('.'), target.value);
    }
  }
});

editorContentEl.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const pageBinding = target.dataset.mailItemPage;
    if (pageBinding) {
      const [scope, indexText] = pageBinding.split('.');
      const attachmentIndex = Number(indexText);
      if ((scope === 'direct' || scope === 'shortcut') && Number.isInteger(attachmentIndex)) {
        updateMailAttachmentItemPage(scope, attachmentIndex, target.value);
        if (scope === 'direct') {
          rerenderDirectMailComposer();
        }
        return;
      }
    }
    const binding = target.dataset.mailBind;
    if (binding) {
      const [scope, ...rest] = binding.split('.');
      if ((scope === 'direct' || scope === 'shortcut') && rest.length > 0) {
        updateMailDraftValue(scope, rest.join('.'), target.value);
        if (scope === 'direct' && (rest[0] === 'attachments' || rest[0] === 'templateId')) {
          rerenderDirectMailComposer();
        }
        return;
      }
    }
    if (target instanceof HTMLInputElement && target.dataset.techniqueCandidateId !== undefined) {
      toggleTechniqueCandidateSelection(target.dataset.techniqueCandidateId, target.checked);
      patchTechniqueManagerListsFromDraft();
      return;
    }
    if (target instanceof HTMLInputElement && target.dataset.learnedTechniqueId !== undefined) {
      if (target.checked) {
        selectedLearnedTechniqueIds.add(target.dataset.learnedTechniqueId);
      } else {
        selectedLearnedTechniqueIds.delete(target.dataset.learnedTechniqueId);
      }
      patchTechniqueManagerListsFromDraft();
      return;
    }
    if (
      (target instanceof HTMLInputElement || target instanceof HTMLSelectElement)
      && target.dataset.techniqueFilter !== undefined
    ) {
      handleTechniqueFilterChange(target);
      return;
    }
  }
  if (target instanceof HTMLSelectElement && target.dataset.gmPositionMapCategory !== undefined) {
    const selected = getSelectedPlayerDetail();
    const category = (target.value as GmPositionMapCategory) || 'map';
    const mapSelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-gm-position-map-select]');
    const currentMapId = mapSelect?.value || draftSnapshot?.mapId || '';
    const nextMapId = patchPositionMapSelect(category, currentMapId);
    if (selected) {
      positionMapCategoryDraft = { playerId: selected.id, category };
    }
    const synced = syncVisualEditorToDraft(
      target.closest<HTMLElement>('[data-editor-tab]') ?? undefined,
    );
    if (!synced.ok) {
      setStatus(synced.message, true);
      return;
    }
    if (draftSnapshot) {
      draftSnapshot.mapId = nextMapId;
    }
    const detail = getSelectedPlayerDetail();
    if (detail && draftSnapshot) {
      editorMetaEl.innerHTML = getEditorMetaMarkup(detail);
      patchEditorPreview(detail, draftSnapshot);
    }
    return;
  }
  if (target instanceof HTMLSelectElement && target.dataset.catalogSelect === 'inventory-type') {
    /** currentInventoryAddType：当前背包Add类型。 */
    currentInventoryAddType = (target.value as (typeof ITEM_TYPES)[number]) || 'material';
    updateInventoryAddControls(true);
    return;
  }
  const synced = syncVisualEditorToDraft(
    target instanceof Element
      ? target.closest<HTMLElement>('[data-editor-tab]') ?? undefined
      : undefined,
  );
  if (!synced.ok) {
    setStatus(synced.message, true);
    return;
  }
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const path = target.dataset.bind;
    if (path && applyCatalogBindingChange(path, target.value)) {
      return;
    }
  }
  const detail = getSelectedPlayerDetail();
  if (detail && draftSnapshot) {
    editorMetaEl.innerHTML = getEditorMetaMarkup(detail);
    patchEditorPreview(detail, draftSnapshot);
  }
});

editorContentEl.addEventListener('focusout', () => {
  window.setTimeout(() => {
    flushBlockedEditorRender();
  }, 0);
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || !activeSearchableItemField) {
    return;
  }
  if (activeSearchableItemField.contains(target)) {
    return;
  }
  closeSearchableItemField(activeSearchableItemField);
});

document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
  const root = target.closest<HTMLElement>('[data-item-combobox]');
  if (!root || root.dataset.open === 'true') {
    return;
  }
  openSearchableItemField(root);
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
  const root = target.closest<HTMLElement>('[data-item-combobox]');
  if (!root) {
    return;
  }
  if (root.dataset.open !== 'true') {
    openSearchableItemField(root, false);
    return;
  }
  renderSearchableItemOptions(root);
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const optionButton = target.closest<HTMLButtonElement>('[data-item-option-value]');
  if (optionButton) {
    const root = optionButton.closest<HTMLElement>('[data-item-combobox]');
    if (!root) {
      return;
    }
    commitSearchableItemSelection(root, optionButton.dataset.itemOptionValue ?? '');
    return;
  }
  const toggleButton = target.closest<HTMLButtonElement>('[data-item-combobox-toggle]');
  if (!toggleButton) {
    return;
  }
  const root = toggleButton.closest<HTMLElement>('[data-item-combobox]');
  if (!root) {
    return;
  }
  event.preventDefault();
  if (root.dataset.open === 'true') {
    closeSearchableItemField(root);
    return;
  }
  openSearchableItemField(root);
  getSearchableItemInput(root)?.focus();
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
  const root = target.closest<HTMLElement>('[data-item-combobox]');
  if (!root) {
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (root.dataset.open !== 'true') {
      openSearchableItemField(root, false);
      return;
    }
    moveSearchableItemActiveIndex(root, 1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (root.dataset.open !== 'true') {
      openSearchableItemField(root, false);
      return;
    }
    moveSearchableItemActiveIndex(root, -1);
    return;
  }
  if (event.key === 'Enter' && root.dataset.open === 'true') {
    event.preventDefault();
    const listEl = getSearchableItemList(root);
    const activeIndex = Number(root.dataset.activeIndex ?? '-1');
    const activeButton = listEl?.querySelectorAll<HTMLButtonElement>('[data-item-option-value]')[activeIndex];
    if (activeButton) {
      commitSearchableItemSelection(root, activeButton.dataset.itemOptionValue ?? '');
    }
    return;
  }
  if (event.key === 'Escape' && root.dataset.open === 'true') {
    event.preventDefault();
    closeSearchableItemField(root);
  }
});

playerSearchInput.addEventListener('input', () => {
  /** currentPlayerPage：当前玩家分页。 */
  currentPlayerPage = 1;
  if (playerSearchTimer !== null) {
    window.clearTimeout(playerSearchTimer);
  }
  playerSearchTimer = window.setTimeout(() => {
    loadPlayerList(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
    });
  }, 250);
});
playerSortSelect.addEventListener('change', () => {
  /** currentPlayerSort：当前玩家排序。 */
  currentPlayerSort = (playerSortSelect.value as GmPlayerSortMode) || 'realm-desc';
  /** currentPlayerPage：当前玩家分页。 */
  currentPlayerPage = 1;
  /** lastPlayerListStructureKey：last玩家列表Structure Key。 */
  lastPlayerListStructureKey = null;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
playerAccountStatusFilterSelect.addEventListener('change', () => {
  currentPlayerAccountStatusFilter = (playerAccountStatusFilterSelect.value as GmPlayerAccountStatusFilter) || 'all';
  currentPlayerPage = 1;
  lastPlayerListStructureKey = null;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
playerPrevPageBtn.addEventListener('click', () => {
  if (currentPlayerPage <= 1) {
    return;
  }
  currentPlayerPage -= 1;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
playerNextPageBtn.addEventListener('click', () => {
  if (currentPlayerPage >= currentPlayerTotalPages) {
    return;
  }
  currentPlayerPage += 1;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
redeemTabBtn.addEventListener('click', () => switchTab('redeem'));
playerTabBtn.addEventListener('click', () => switchTab('players'));
serverTabBtn.addEventListener('click', () => switchTab('server'));
worldTabBtn.addEventListener('click', () => switchTab('world'));
shortcutTabBtn.addEventListener('click', () => switchTab('shortcuts'));
envTabBtn.addEventListener('click', () => switchTab('secrets'));
gameConfigTabBtn.addEventListener('click', () => switchTab('gameconfig'));
aiTabBtn.addEventListener('click', () => switchTab('ai'));
generatedTechniqueTabBtn.addEventListener('click', () => switchTab('generatedTechniques'));
generatedTechniqueSubtabTechniquesBtn.addEventListener('click', () => switchGeneratedTechniqueSubtab('techniques'));
generatedTechniqueSubtabJobsBtn.addEventListener('click', () => switchGeneratedTechniqueSubtab('jobs'));
generatedTechniqueSubtabManualBtn.addEventListener('click', () => switchGeneratedTechniqueSubtab('manual'));
tradesTabBtn.addEventListener('click', () => switchTab('trades'));
serverSubtabOverviewBtn.addEventListener('click', () => switchServerTab('overview'));
serverSubtabTrafficBtn.addEventListener('click', () => switchServerTab('traffic'));
serverSubtabCpuBtn.addEventListener('click', () => switchServerTab('cpu'));
serverSubtabMemoryBtn.addEventListener('click', () => switchServerTab('memory'));
serverSubtabDatabaseBtn.addEventListener('click', () => switchServerTab('database'));
serverSubtabLogsBtn.addEventListener('click', () => switchServerTab('logs'));
serverSubtabWorkersBtn.addEventListener('click', () => switchServerTab('workers'));
serverSubtabEnvCheckBtn.addEventListener('click', () => switchServerTab('envCheck'));
serverSubtabObjectsBtn.addEventListener('click', () => switchServerTab('objects'));
// 诊断面板事件委托（动态渲染，通过 database panel 委托）
serverPanelDatabaseEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  // 撤回按钮
  if (target.closest('#server-diagnostics-undo')) {
    if (!lastExecCommand) return;
    const undoCmd = lastExecCommand;
    if (!window.confirm(`确认撤回上一次写操作？\n\n${undoCmd}`)) return;
    // 撤回 = 把上一条 exec 的记录清除，重新执行之前的查询
    lastExecCommand = lastExecPreviousCommand;
    lastExecPreviousCommand = null;
    const cmdEl = getDiagCommandEl();
    // 回到上一条历史查询
    const history = diagHistoryLoad();
    const prevQuery = history.find((h) => !h.toLowerCase().startsWith('exec ')) ?? 'help';
    if (cmdEl) cmdEl.value = prevQuery;
    setStatus(`已撤回记录，请手动执行反向操作恢复数据。原命令: ${undoCmd.slice(0, 100)}`, true);
    updateUndoButton();
    return;
  }
  // 执行按钮
  if (target.closest('#server-diagnostics-run')) {
    const cmdEl = getDiagCommandEl();
    if (cmdEl) runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
    return;
  }
  // 帮助按钮
  if (target.closest('#server-diagnostics-help')) {
    const cmdEl = getDiagCommandEl();
    if (cmdEl) cmdEl.value = 'help';
    runDiagnosticsCommand('help').catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '加载查询帮助失败', true); });
    return;
  }
  // 快捷按钮
  const diagBtn = target.closest<HTMLElement>('[data-diag-cmd]');
  if (diagBtn) {
    const cmd = diagBtn.dataset.diagCmd ?? '';
    const prompt = diagBtn.dataset.diagPrompt;
    const cmdEl = getDiagCommandEl();
    if (prompt) {
      showDiagPrompt(prompt).then((input) => {
        if (!input || !cmdEl) return;
        cmdEl.value = cmd + input.trim();
        runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
      });
    } else {
      if (cmdEl) cmdEl.value = cmd;
      if (cmdEl) runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
    }
    return;
  }
  // 单元格点击编辑
  const td = target.closest<HTMLTableCellElement>('td.diag-cell-editable');
  if (td && !td.classList.contains('cell-editing')) {
    startDiagCellEdit(td);
    return;
  }
});
serverPanelDatabaseEl.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (target.id !== 'server-diagnostics-command') return;
  const cmdEl = target as HTMLTextAreaElement;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
    return;
  }
  if (event.key === 'ArrowUp' && !event.shiftKey) {
    const prev = diagHistoryNavigate('up');
    if (prev !== null) { event.preventDefault(); cmdEl.value = prev; }
  }
  if (event.key === 'ArrowDown' && !event.shiftKey) {
    const next = diagHistoryNavigate('down');
    if (next !== null) { event.preventDefault(); cmdEl.value = next; }
  }
});
serverFlagsRefreshBtn?.addEventListener('click', () => {
  loadRuntimeFlags().catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '加载运行时开关失败', true);
  });
});
serverObjectsRefreshBtn.addEventListener('click', () => {
  loadObjectCounts().catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '加载对象信息失败', true);
  });
});
serverFlagsAddBtn?.addEventListener('click', () => {
  const key = serverFlagsNewKeyInput?.value.trim();
  if (!key) return;
  addRuntimeFlag(key).then(() => {
    if (serverFlagsNewKeyInput) serverFlagsNewKeyInput.value = '';
  }).catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '添加开关失败', true);
  });
});
toggleMaintenanceModeBtn.addEventListener('click', () => {
  const nextActive = state?.operations?.maintenanceActive !== true;
  const message = nextActive
    ? '确认开启维护中？主线连接会被拒绝，世界 tick 会暂停。'
    : '确认结束维护？玩家将可以重新连接。';
  if (!window.confirm(message)) {
    return;
  }
  setMaintenanceMode(nextActive).catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '切换维护中失败', true);
  });
});
restartServerBtn.addEventListener('click', () => {
  if (!window.confirm('确认重启服务器？当前连接会断开，服务由外层托管器重新拉起。')) {
    return;
  }
  restartServer().catch((err: unknown) => {
    restartServerBtn.disabled = false;
    setStatus(err instanceof Error ? err.message : '重启服务器失败', true);
  });
});
cpuBreakdownListEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const sortButton = target.closest<HTMLElement>('[data-metric-tree-sort-key]');
  if (sortButton) {
    const sortKey = sortButton.dataset.metricTreeSortKey;
    if (perfIsCpuBreakdownSortMode(sortKey)) {
      setCpuBreakdownSort(sortKey);
    }
    return;
  }
  const toggleTarget = target.closest<HTMLElement>('[data-metric-tree-toggle-key]');
  const groupKey = toggleTarget?.dataset.metricTreeToggleKey;
  if (groupKey) {
    toggleCpuBreakdownGroup(groupKey);
  }
});
loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  login().catch((e) => console.error('[GM]', e));
});
editorTabBasicBtn.addEventListener('click', () => switchEditorTab('basic'));
editorTabPositionBtn.addEventListener('click', () => switchEditorTab('position'));
editorTabRealmBtn.addEventListener('click', () => switchEditorTab('realm'));
editorTabBuffsBtn.addEventListener('click', () => switchEditorTab('buffs'));
editorTabTechniquesBtn.addEventListener('click', () => switchEditorTab('techniques'));
editorTabCraftSkillsBtn.addEventListener('click', () => switchEditorTab('craftSkills'));
editorTabBenefitsBtn.addEventListener('click', () => switchEditorTab('benefits'));
editorTabShortcutsBtn.addEventListener('click', () => switchEditorTab('shortcuts'));
editorTabItemsBtn.addEventListener('click', () => switchEditorTab('items'));
editorTabQuestsBtn.addEventListener('click', () => switchEditorTab('quests'));
editorTabMailBtn.addEventListener('click', () => switchEditorTab('mail'));
editorTabRiskBtn.addEventListener('click', () => switchEditorTab('risk'));
editorTabPersistedBtn.addEventListener('click', () => switchEditorTab('persisted'));
playerDatabaseTabsEl.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('[data-database-table]')
    : null;
  const nextTable = target?.dataset.databaseTable?.trim() ?? '';
  if (!nextTable) {
    return;
  }
  currentDatabaseTable = nextTable;
  const detail = getSelectedPlayerDetail();
  if (detail) {
    renderPlayerDatabasePanel(detail);
  }
});

document.getElementById('refresh-state')?.addEventListener('click', () => {
  const loader = currentTab === 'players' || currentTab === 'shortcuts'
    ? loadPlayerList(false, true)
    : loadState(false, true);
  loader.catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.refresh.failed'), true);
  });
});
document.getElementById('logout')?.addEventListener('click', () => logout());
document.getElementById('spawn-bots')?.addEventListener('click', () => {
  spawnBots().catch((e) => console.error('[GM]', e));
});
document.getElementById('remove-all-bots')?.addEventListener('click', () => {
  removeAllBots().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-return-all-to-default-spawn')?.addEventListener('click', () => {
  returnAllPlayersToDefaultSpawn().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-cleanup-invalid-items')?.addEventListener('click', () => {
  cleanupAllPlayersInvalidItems().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-migrate-recovery-pills')?.addEventListener('click', () => {
  migrateAllPlayersRecoveryPills().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-repair-market-storage-item-ids')?.addEventListener('click', () => {
  repairMarketStorageItemIds().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-migrate-ai-arts-strength-v1-to-v2')?.addEventListener('click', () => {
  migrateAiArtsStrengthDraftsV1ToV2().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-recover-empty-custom-technique-books')?.addEventListener('click', () => {
  recoverEmptyCustomTechniqueBooks().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-delete-empty-custom-technique-books')?.addEventListener('click', () => {
  deleteEmptyCustomTechniqueBooks().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-repair-quest-progress-payloads')?.addEventListener('click', () => {
  repairQuestProgressPayloads().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-refresh-online-technique-templates')?.addEventListener('click', () => {
  refreshOnlineTechniqueTemplates().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-refill-stamina')?.addEventListener('click', () => {
  refillOnlineAndOfflineHangingPlayersStamina().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-cleanup-abnormal-temporary-tiles')?.addEventListener('click', () => {
  cleanupAbnormalTemporaryTiles().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-compensate-combat-exp-2026-04-09')?.addEventListener('click', () => {
  compensateAllPlayersCombatExp().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-compensate-foundation-2026-04-09')?.addEventListener('click', () => {
  compensateAllPlayersFoundation().catch((e) => console.error('[GM]', e));
});
shortcutWorkspaceEl.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  const action = trigger?.dataset.action;
  if (!action || !trigger) {
    return;
  }
  if (action === 'add-shortcut-mail-attachment') {
    addMailAttachment('shortcut');
    return;
  }
  if (action === 'remove-shortcut-mail-attachment') {
    removeMailAttachment('shortcut', Number(trigger.dataset.mailAttachmentIndex));
    return;
  }
  if (action === 'send-shortcut-mail') {
    sendShortcutMail().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
  }
});
shortcutWorkspaceEl.addEventListener('input', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const binding = target.dataset.mailBind;
    if (!binding) {
      return;
    }
    const [scope, ...rest] = binding.split('.');
    if (scope === 'shortcut' && rest.length > 0) {
      updateMailDraftValue('shortcut', rest.join('.'), target.value);
    }
  }
});
shortcutWorkspaceEl.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const pageBinding = target.dataset.mailItemPage;
    if (pageBinding) {
      const [scope, indexText] = pageBinding.split('.');
      const attachmentIndex = Number(indexText);
      if (scope === 'shortcut' && Number.isInteger(attachmentIndex)) {
        updateMailAttachmentItemPage('shortcut', attachmentIndex, target.value);
        renderShortcutMailComposer();
        return;
      }
    }
    const binding = target.dataset.mailBind;
    if (!binding) {
      return;
    }
    const [scope, ...rest] = binding.split('.');
    if (scope === 'shortcut' && rest.length > 0) {
      updateMailDraftValue('shortcut', rest.join('.'), target.value);
      if (rest[0] === 'attachments' || rest[0] === 'templateId' || rest[0] === 'targetPlayerId') {
        renderShortcutMailComposer();
      }
    }
  }
});
shortcutWorkspaceEl.addEventListener('focusout', () => {
  window.setTimeout(() => {
    flushShortcutMailComposerRefresh();
  }, 0);
});
redeemWorkspaceEl?.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-redeem-group-id],[data-code-id]');
  if (!trigger) {
    return;
  }
  const groupId = trigger.dataset.redeemGroupId;
  if (groupId) {
    /** selectedRedeemGroupId：selected兑换分组ID。 */
    selectedRedeemGroupId = groupId;
    /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
    redeemLatestGeneratedCodes = [];
    loadRedeemGroupDetail(groupId, true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.load.failed'), true);
    });
    return;
  }
  const action = trigger.dataset.action;
  if (!action) {
    return;
  }
  if (action === 'new-redeem-group') {
    /** selectedRedeemGroupId：selected兑换分组ID。 */
    selectedRedeemGroupId = null;
    /** redeemGroupDetailState：兑换分组详情状态。 */
    redeemGroupDetailState = null;
    /** redeemDraft：兑换Draft。 */
    redeemDraft = createDefaultRedeemGroupDraft();
    /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
    redeemLatestGeneratedCodes = [];
    renderRedeemPanel();
    return;
  }
  if (action === 'add-redeem-reward') {
    redeemDraft.rewards.push(createDefaultRedeemReward());
    renderRedeemPanel();
    return;
  }
  if (action === 'remove-redeem-reward') {
    const rewardIndex = Number(trigger.dataset.rewardIndex);
    if (Number.isInteger(rewardIndex) && rewardIndex >= 0 && rewardIndex < redeemDraft.rewards.length) {
      redeemDraft.rewards.splice(rewardIndex, 1);
      renderRedeemPanel();
    }
    return;
  }
  if (action === 'refresh-redeem-groups') {
    loadRedeemGroups(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.refresh.failed'), true);
    });
    return;
  }
  if (action === 'create-redeem-group') {
    createRedeemGroup().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.create.failed'), true);
    });
    return;
  }
  if (action === 'save-redeem-group') {
    saveRedeemGroup().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.save.failed'), true);
    });
    return;
  }
  if (action === 'append-redeem-codes') {
    appendRedeemCodes().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.append.failed'), true);
    });
    return;
  }
  if (action === 'delete-redeem-group') {
    deleteRedeemGroup().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.delete.failed'), true);
    });
    return;
  }
  if (action === 'copy-active-redeem-codes') {
    copyActiveRedeemCodes().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.copy.failed'), true);
    });
    return;
  }
  if (action === 'destroy-redeem-code') {
    const codeId = trigger.dataset.codeId;
    if (!codeId) {
      return;
    }
    destroyRedeemCode(codeId).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.destroy.failed'), true);
    });
  }
});
redeemWorkspaceEl?.addEventListener('input', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const binding = target.dataset.redeemBind;
    if (!binding) {
      return;
    }
    updateRedeemDraftValue(binding, target.value);
  }
});
redeemWorkspaceEl?.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const binding = target.dataset.redeemBind;
    if (!binding) {
      return;
    }
    updateRedeemDraftValue(binding, target.value);
    renderRedeemPanel();
  }
});
resetNetworkStatsBtn.addEventListener('click', () => {
  resetNetworkStats().catch((e) => console.error('[GM]', e));
});
toggleNetworkPayloadCaptureBtn.addEventListener('click', () => {
  toggleNetworkPayloadCapture().catch((e) => console.error('[GM]', e));
});
serverPanelTrafficEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const sortButton = target.closest<HTMLElement>('[data-metric-tree-sort-key]');
  if (sortButton) {
    const sortKey = sortButton.dataset.metricTreeSortKey;
    if (perfIsTrafficBreakdownSortMode(sortKey)) {
      setTrafficBreakdownSort(sortKey);
    }
    return;
  }
  const toggleTarget = target.closest<HTMLElement>('[data-metric-tree-toggle-key]');
  const groupKey = toggleTarget?.dataset.metricTreeToggleKey;
  if (groupKey) {
    toggleTrafficBreakdownGroup(groupKey);
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-network-large-payload-key]');
  const key = button?.dataset.networkLargePayloadKey;
  if (!key) {
    return;
  }
  event.preventDefault();
  const bucket = networkLargePayloadBucketByKey.get(key);
  if (!bucket) {
    setStatus(t('gm.network.large-payload.expired'), true);
    return;
  }
  openNetworkPayloadModal(bucket);
});
resetCpuStatsBtn.addEventListener('click', () => {
  resetCpuStats().catch((e) => console.error('[GM]', e));
});
resetPathfindingStatsBtn.addEventListener('click', () => {
  resetPathfindingStats().catch((e) => console.error('[GM]', e));
});
triggerManualGcBtn.addEventListener('click', () => {
  triggerManualGc().catch((e) => console.error('[GM]', e));
});
writeHeapSnapshotBtn.addEventListener('click', () => {
  writeHeapSnapshot().catch((e) => console.error('[GM]', e));
});
copyHeapSnapshotSummaryBtn?.addEventListener('click', () => {
  writeAndCopyHeapSnapshotSummary().catch((e) => console.error('[GM]', e));
});
copyLatestHeapSnapshotSummaryBtn?.addEventListener('click', () => {
  copyLatestHeapSnapshotSummary().catch((e) => console.error('[GM]', e));
});
serverLogsLoadOlderBtn.addEventListener('click', () => {
  loadServerLogs(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.server.logs.load-older.failed'), true);
  });
});
serverLogsRefreshBtn.addEventListener('click', () => {
  loadServerLogs(false).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.server.logs.refresh.failed'), true);
  });
});
serverWorkersRefreshBtn.addEventListener('click', () => {
  loadWorkerState(false).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '刷新 worker 状态失败', true);
  });
});
serverEnvCheckRefreshBtn.addEventListener('click', () => {
  loadEnvCheck(false).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '环境检测失败', true);
  });
});
serverPanelDatabaseEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;

  const subTabBtn = target?.closest<HTMLButtonElement>('[data-db-subtab]');
  if (subTabBtn?.dataset.dbSubtab) {
    databaseSubTab = subTabBtn.dataset.dbSubtab as DatabaseSubTab;
    renderDatabasePanel();
    if (databaseSubTab === 'table-stats' && !tableStatsState && !tableStatsLoading) {
      loadTableStats().catch((e) => console.error('[GM]', e));
    }
    return;
  }

  const loadStatsBtn = target?.closest<HTMLButtonElement>('[data-action="load-table-stats"]');
  if (loadStatsBtn) {
    loadTableStats().catch((e) => console.error('[GM]', e));
    return;
  }

  const cleanupBtn = target?.closest<HTMLButtonElement>('[data-cleanup-target]');
  if (cleanupBtn?.dataset.cleanupTarget) {
    const tableName = cleanupBtn.dataset.cleanupTarget;
    const cleanupMode = cleanupBtn.dataset.cleanupMode === 'all' ? 'all' : 'older_than';
    const confirmMessage = cleanupMode === 'all'
      ? `确认直接清空 ${tableName}？这会删除该表所有记录，此操作不可撤销。`
      : `确认清理 ${tableName} 中 7 天前的数据？此操作不可撤销。`;
    if (confirm(confirmMessage)) {
      cleanupTable(tableName, cleanupMode).catch((e) => console.error('[GM]', e));
    }
    return;
  }

  const refreshButton = target?.closest<HTMLButtonElement>('#database-refresh');
  if (refreshButton) {
    loadDatabaseState(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.state.refresh.failed'), true);
    });
    return;
  }

  const exportButton = target?.closest<HTMLButtonElement>('#database-export-current');
  if (exportButton) {
    exportCurrentDatabase().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.export.failed'), true);
    });
    return;
  }

  const uploadButton = target?.closest<HTMLButtonElement>('#database-upload-backup');
  if (uploadButton) {
    uploadDatabaseBackupFile(false).catch((error: unknown) => {
      databaseImportBusy = false;
      databaseImportStatus = error instanceof Error ? error.message : t('gm.database.upload.failed');
      renderDatabasePanel();
      setStatus(error instanceof Error ? error.message : t('gm.database.upload.failed'), true);
    });
    return;
  }

  const uploadAndRestoreButton = target?.closest<HTMLButtonElement>('#database-upload-and-restore');
  if (uploadAndRestoreButton) {
    uploadDatabaseBackupFile(true).catch((error: unknown) => {
      databaseImportBusy = false;
      databaseImportStatus = error instanceof Error ? error.message : t('gm.database.upload-and-restore.failed');
      renderDatabasePanel();
      setStatus(error instanceof Error ? error.message : t('gm.database.upload-and-restore.failed'), true);
    });
    return;
  }

  const downloadButton = target?.closest<HTMLButtonElement>('[data-db-download]');
  if (downloadButton?.dataset.dbDownload) {
    downloadDatabaseBackup(downloadButton.dataset.dbDownload).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.download.failed'), true);
    });
    return;
  }

  const restoreButton = target?.closest<HTMLButtonElement>('[data-db-restore]');
  if (restoreButton?.dataset.dbRestore) {
    restoreDatabaseBackup(restoreButton.dataset.dbRestore).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.restore.failed'), true);
    });
  }
});
gmPasswordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  changeGmPassword().catch((e) => console.error('[GM]', e));
});
envConfigInitEventBindings(envConfigContext);
generatedTechniqueRefreshBtn.addEventListener('click', () => {
  if (currentGeneratedTechniqueSubtab === 'manual') {
    generatedTechniqueEditor.preview().catch(() => undefined);
    return;
  }
  loadCurrentGeneratedTechniqueSubtab(false).catch(handleGeneratedTechniquePanelLoadError);
});
generatedTechniquePagePrevBtn.addEventListener('click', () => {
  if (currentGeneratedTechniqueSubtab === 'manual') return;
  if (currentGeneratedTechniqueSubtab === 'jobs') {
    if (techniqueGenerationJobPage <= 1) return;
    techniqueGenerationJobPage -= 1;
  } else {
    if (generatedTechniquePage <= 1) return;
    generatedTechniquePage -= 1;
  }
  loadCurrentGeneratedTechniqueSubtab(true).catch(handleGeneratedTechniquePanelLoadError);
});
generatedTechniquePageNextBtn.addEventListener('click', () => {
  if (currentGeneratedTechniqueSubtab === 'manual') return;
  if (currentGeneratedTechniqueSubtab === 'jobs') {
    if (techniqueGenerationJobPage >= techniqueGenerationJobTotalPages) return;
    techniqueGenerationJobPage += 1;
  } else {
    if (generatedTechniquePage >= generatedTechniqueTotalPages) return;
    generatedTechniquePage += 1;
  }
  loadCurrentGeneratedTechniqueSubtab(true).catch(handleGeneratedTechniquePanelLoadError);
});
generatedTechniqueListEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const jobButton = target?.closest<HTMLButtonElement>('[data-technique-generation-job-id]');
  const jobId = jobButton?.dataset.techniqueGenerationJobId;
  if (jobId) {
    loadTechniqueGenerationJobDetail(jobId).catch((error: unknown) => {
      generatedTechniqueJsonEl.value = error instanceof Error ? error.message : '加载详情失败';
      setStatus(error instanceof Error ? error.message : '加载生成任务详情失败', true);
    });
    return;
  }
  const techniqueButton = target?.closest<HTMLButtonElement>('[data-generated-technique-id]');
  const techniqueId = techniqueButton?.dataset.generatedTechniqueId;
  if (!techniqueId) return;
  loadGeneratedTechniqueDetail(techniqueId).catch((error: unknown) => {
    generatedTechniqueJsonEl.value = error instanceof Error ? error.message : '加载详情失败';
    setStatus(error instanceof Error ? error.message : '加载功法详情失败', true);
  });
});
tradesFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const pageSizeRaw = Number(tradesPageSizeInput.value);
  loadTrades({
    resetPage: true,
    playerKeyword: tradesPlayerInput.value,
    itemKeyword: tradesItemInput.value,
    pageSize: Number.isFinite(pageSizeRaw) ? Math.trunc(pageSizeRaw) : undefined,
  }).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
tradesResetBtn.addEventListener('click', () => {
  tradesPlayerInput.value = '';
  tradesItemInput.value = '';
  tradesPageSizeInput.value = '20';
  loadTrades({
    resetPage: true,
    playerKeyword: '',
    itemKeyword: '',
    pageSize: 20,
  }).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
tradesPagePrevBtn.addEventListener('click', () => {
  if (tradesQueryState.page <= 1) return;
  tradesQueryState.page -= 1;
  loadTrades().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
tradesPageNextBtn.addEventListener('click', () => {
  tradesQueryState.page += 1;
  loadTrades().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
savePlayerBtn.addEventListener('click', () => {
  saveSelectedPlayer().catch((e) => console.error('[GM]', e));
});
refreshPlayerBtn.addEventListener('click', () => {
  refreshSelectedPlayer().catch((e) => console.error('[GM]', e));
});
openPlayerMailBtn.addEventListener('click', () => {
  openSelectedPlayerMailTab();
});
resetPlayerBtn.addEventListener('click', () => {
  resetSelectedPlayer().catch((e) => console.error('[GM]', e));
});
resetHeavenGateBtn.addEventListener('click', () => {
  resetSelectedPlayerHeavenGate().catch((e) => console.error('[GM]', e));
});
removeBotBtn.addEventListener('click', () => {
  removeSelectedBot().catch((e) => console.error('[GM]', e));
});

if (token) {
  showShell();
  switchTab('server');
  switchServerTab(currentServerTab);
  switchEditorTab(currentEditorTab);
  loadEditorCatalog()
    .then(() => loadState())
    .then(() => startPolling())
    .catch(() => logout(t('gm.request.login-expired')));
} else {
  showLogin();
}
