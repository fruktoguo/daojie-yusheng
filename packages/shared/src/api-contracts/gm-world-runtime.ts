/**
 * GM 世界运行时、邮件、环境变量、游戏配置与 AI Provider 领域契约。
 *
 * 包含世界实例分线预设/持久化策略/来源/摘要/列表响应、运行时实体/地图快照/
 * 世界实例运行态响应、创建/迁移实例请求、地图 tick/时间更新请求、运行时查询、
 * 创建/广播/发送邮件请求与响应、性能重置响应、密钥管理、环境变量管理、
 * 高危确认/重启/重载环境变量、游戏配置 CRUD 以及 AI Provider 配置管理。
 */

import type { MailAttachment, MailTemplateArg } from '../mail-types';
import type { GameTimeState, MapTimeConfig, VisibleTile } from '../world-core-types';
/** GM 世界实例分线预设。 */
export type GmWorldInstanceLinePreset = 'peaceful' | 'real';

export type GmWorldInstancePersistentPolicy = 'persistent' | 'long_lived' | 'session' | 'ephemeral';

/** GM 世界实例来源。 */
export type GmWorldInstanceOrigin = 'bootstrap' | 'gm_manual';

/** GM 世界实例列表摘要。 */
export interface GmWorldInstanceSummary {
/**
 * instanceId：实例 ID 标识。
 */

  instanceId: string;
  /**
 * displayName：实例展示名。
 */

  displayName: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  /** 密室等附属实例绑定的入口地图实例。 */
  parentInstanceId?: string;
  /** 附属实例绑定的入口建筑。 */
  parentBuildingId?: string;
  parentDisplayName?: string;
  /** GM 世界管理中的父子实例组。 */
  linkedGroupRootInstanceId?: string;
  linkedGroupDisplayName?: string;
  linkedGroupOrder?: number;
  linkedGroupLinePreset?: GmWorldInstanceLinePreset;
  /** 运行时实例领域类型。 */
  kind?: string;
  /**
 * templateId：地图模板 ID 标识。
 */

  templateId: string;
  /**
 * templateName：地图模板名称。
 */

  templateName: string;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /**
 * linePreset：分线预设。
 */

  linePreset: GmWorldInstanceLinePreset;
  /**
 * lineIndex：线路序号。
 */

  lineIndex: number;
  /**
 * instanceOrigin：实例来源。
 */

  instanceOrigin: GmWorldInstanceOrigin;
  /**
 * defaultEntry：是否为默认入口线路。
 */

  defaultEntry: boolean;
  /**
 * persistent：是否持久实例。
 */

  persistent: boolean;
  /**
 * persistentPolicy：实例持久化策略。
 */

  persistentPolicy?: GmWorldInstancePersistentPolicy;
  /**
 * supportsPvp：是否支持 PVP。
 */

  supportsPvp: boolean;
  /**
 * canDamageTile：是否可攻击地块。
 */

  canDamageTile: boolean;
  /**
 * destroyAt：计划销毁时间。
 */

  destroyAt?: string | null;
  /**
 * playerCount：在线人数。
 */

  playerCount: number;
  /**
 * tick：实例 tick。
 */

  tick: number;
  /**
 * worldRevision：世界版本号。
 */

  worldRevision: number;
}

/** GM 世界实例列表响应。 */
export interface GmWorldInstanceListRes {
/**
 * instances：实例列表。
 */

  instances: GmWorldInstanceSummary[];
}

// ===== GM 世界管理 =====

/** GM 运行时地图实体 */
export interface GmRuntimeEntity {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * char：char相关字段。
 */

  char: string;
  /**
 * color：color相关字段。
 */

  color: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * kind：kind相关字段。
 */

  kind: 'player' | 'monster' | 'npc' | 'container';
  /**
 * hp：hp相关字段。
 */

  hp?: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;
  /**
 * dead：dead相关字段。
 */

  dead?: boolean;
  /**
 * alive：alive相关字段。
 */

  alive?: boolean;
  /**
 * targetPlayerId：目标玩家ID标识。
 */

  targetPlayerId?: string;
  /**
 * respawnLeft：重生Left相关字段。
 */

  respawnLeft?: number;
  /**
 * online：online相关字段。
 */

  online?: boolean;
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle?: boolean;
  /**
 * isBot：启用开关或状态标识。
 */

  isBot?: boolean;
}

/** GM 运行时地图快照响应 */
export interface GmMapRuntimeRes {
/**
 * mapId：地图ID标识。
 */

  mapId: string;
  /**
 * mapName：地图名称名称或显示文本。
 */

  mapName: string;
  /**
 * width：width相关字段。
 */

  width: number;
  /**
 * height：height相关字段。
 */

  height: number;
  /** 视口区域内的地块，tiles[dy][dx]，dy/dx 相对于请求的 x,y */
  tiles: (VisibleTile | null)[][];
  /** 视口区域内的实体 */
  entities: GmRuntimeEntity[];
  /** 当前地图时间状态 */
  time: GameTimeState;
  /** 当前地图时间配置 */
  timeConfig: MapTimeConfig;
  /** 当前 tick 倍率，0=暂停 */
  tickSpeed: number;
  /** 地图 tick 是否暂停 */
  tickPaused: boolean;
}

/** GM 世界实例运行态快照响应。 */
export interface GmWorldInstanceRuntimeRes extends GmMapRuntimeRes {
/**
 * instanceId：实例 ID 标识。
 */

  instanceId: string;
  /**
 * instanceName：实例名称。
 */

  instanceName: string;
  parentInstanceId?: string;
  parentBuildingId?: string;
  parentDisplayName?: string;
  /**
 * templateId：地图模板 ID 标识。
 */

  templateId: string;
  /**
 * templateName：地图模板名称。
 */

  templateName: string;
  /**
 * linePreset：分线预设。
 */

  linePreset: GmWorldInstanceLinePreset;
  /**
 * lineIndex：线路序号。
 */

  lineIndex: number;
  /**
 * instanceOrigin：实例来源。
 */

  instanceOrigin: GmWorldInstanceOrigin;
  /**
 * defaultEntry：是否为默认入口线路。
 */

  defaultEntry: boolean;
  /**
 * persistentPolicy：实例持久化策略。
 */

  persistentPolicy?: GmWorldInstancePersistentPolicy;
  /**
 * supportsPvp：是否支持 PVP。
 */

  supportsPvp: boolean;
  /**
 * canDamageTile：是否可攻击地块。
 */

  canDamageTile: boolean;
  /**
 * destroyAt：计划销毁时间。
 */

  destroyAt?: string | null;
  /**
 * playerCount：在线人数。
 */

  playerCount: number;
  /**
 * worldRevision：世界版本号。
 */

  worldRevision: number;
}

/** GM 创建世界实例请求。 */
export interface GmCreateWorldInstanceReq {
/**
 * templateId：地图模板 ID 标识。
 */

  templateId: string;
  /**
 * linePreset：分线预设。
 */

  linePreset: GmWorldInstanceLinePreset;
  /**
 * displayName：实例展示名。
 */

  displayName?: string;
  /**
 * persistentPolicy：实例持久化策略。
 */

  persistentPolicy?: GmWorldInstancePersistentPolicy;
  /**
 * expireAt：计划销毁时间戳，毫秒。
 */

  expireAt?: number | null;
}

/** GM 创建世界实例响应。 */
export interface GmCreateWorldInstanceRes {
/**
 * instance：实例摘要。
 */

  instance: GmWorldInstanceSummary;
}

/** GM 迁移玩家到实例请求。 */
export interface GmTransferPlayerToInstanceReq {
/**
 * playerId：玩家 ID 标识。
 */

  playerId: string;
  /**
 * instanceId：实例 ID 标识。
 */

  instanceId: string;
  /**
 * x：目标 X 坐标。
 */

  x?: number;
  /**
 * y：目标 Y 坐标。
 */

  y?: number;
}

/** GM 修改地图 tick 速率请求 */
export interface GmUpdateMapTickReq {
/**
 * speed：speed数值。
 */

  speed?: number;
  /**
 * paused：paused相关字段。
 */

  paused?: boolean;
}

/** GM 修改地图时间配置请求 */
export interface GmUpdateMapTimeReq {
/**
 * scale：scale相关字段。
 */

  scale?: number;
  /**
 * offsetTicks：offsettick相关字段。
 */

  offsetTicks?: number;
}

/** GM 运行时地图请求查询参数。 */
export interface GmMapRuntimeQuery {
/**
 * x：x相关字段。
 */

  x?: number;
  /**
 * y：y相关字段。
 */

  y?: number;
  /**
 * radius：radiu相关字段。
 */

  radius?: number;
}

/** GM 发信请求，支持模板或自定义正文。 */
export interface GmCreateMailReq {
/**
 * templateId：templateID标识。
 */

  templateId?: string;
  /**
 * args：arg相关字段。
 */

  args?: MailTemplateArg[];
  /**
 * fallbackTitle：fallbackTitle名称或显示文本。
 */

  fallbackTitle?: string;
  /**
 * fallbackBody：fallbackBody相关字段。
 */

  fallbackBody?: string;
  /**
 * attachments：attachment相关字段。
 */

  attachments?: MailAttachment[];
  /**
 * senderLabel：senderLabel名称或显示文本。
 */

  senderLabel?: string;
  /**
 * expireAt：expireAt相关字段。
 */

  expireAt?: number | null;
}

/** GM 重置性能统计的响应。 */
export interface GmResetPerfRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
}

/** GM 广播邮件请求；可选玩家范围为空时按全员邮件处理。 */
export interface GmBroadcastMailReq extends GmCreateMailReq {
  /** 客户端生成的幂等批次 ID；同一操作重试必须复用。 */
  batchId?: string;
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * targetPlayerIds：目标玩家ID相关字段。
 */

  targetPlayerIds?: string[];
}

/** GM 给单个玩家发邮件请求。 */
export interface GmSendPlayerMailReq extends GmCreateMailReq {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;
}

/** GM 给单个玩家发邮件响应。 */
export interface GmSendPlayerMailRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
  /**
 * mailId：邮件ID相关字段。
 */

  mailId: string;
}

/** GM 广播邮件响应。 */
export interface GmBroadcastMailRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
  /**
 * mailId：邮件ID相关字段。
 */

  mailId: string;
  /**
 * batchId：batchID标识。
 */

  batchId: string;
  /**
 * recipientCount：数量或计量字段。
 */

  recipientCount: number;
}

/** GM 发邮件响应。 */
export type GmSendMailRes = GmSendPlayerMailRes | GmBroadcastMailRes;

// ─── GM 密钥管理 ───

/** GM 密钥列表项（不含明文值）。
 *
 * N51 安全收口：原 maskedValue 字段需要 list 时把所有密钥都 decrypt 一遍（即使只是为了 mask），
 * 单次 list 调用就让全部密钥过一遍解密链路；攻击者拿到 GM token 后调用 list 即可获得 mask 中
 * 残留的明文片段。新字段只回 valueLength（密文长度的近似值，不暴露任何明文信息）。
 */
export interface GmSecretListItem {
  key: string;
  description: string;
  /** 密钥明文长度的近似值（基于密文段长度反推），不返回任何明文内容。 */
  valueLength: number;
  updatedAt: string;
}

/** GM 设置密钥请求。 */
export interface GmSetSecretReq {
  key: string;
  value: string;
  description: string;
}

/** GM 密钥详情响应。 */
export interface GmSecretDetailRes {
  found: boolean;
  key?: string;
  value?: string;
  description?: string;
  updatedAt?: string;
}

// ─── GM 环境变量管理 ───

/** GM 环境变量来源。 */
export type GmEnvironmentVarSource = 'process_env' | 'runtime_override' | 'runtime_file' | 'unset';

/** GM 环境变量列表项。 */
export interface GmEnvironmentVarItem {
  key: string;
  /** 展示名称；未配置注册表时回退为 key。 */
  label: string;
  /** 变量说明。 */
  description: string;
  /** 归属分类。 */
  category: string;
  /** 当前显示值；敏感值可由服务端返回脱敏文本。 */
  value: string;
  /** 当前值来源。 */
  source: GmEnvironmentVarSource;
  /** 是否可编辑。 */
  editable: boolean;
  /** 是否支持持久化写入本地 runtime env 文件。 */
  persistable: boolean;
  /** 是否建议重启后才稳定生效。 */
  restartRequired: boolean;
  /** 是否敏感。 */
  sensitive: boolean;
  /** 是否来自注册表。 */
  managed: boolean;
  /** 是否已写入 runtime env 文件。 */
  persistent: boolean;
}

/** GM 环境变量列表响应。 */
export interface GmEnvironmentVarListRes {
  items: GmEnvironmentVarItem[];
  checkedAt: number;
}

/** GM 设置环境变量请求。 */
export interface GmSetEnvironmentVarReq {
  value: string;
  persist?: boolean;
  /** 高危确认短语，须为 SET RUNTIME ENV。 */
  confirmationPhrase?: string;
  confirmPhrase?: string;
}

/** GM 环境变量删除/重载等仅需确认短语的请求体。 */
export interface GmHighRiskConfirmationReq {
  confirmationPhrase?: string;
  confirmPhrase?: string;
}

/** GM 服务端重启请求。 */
export interface GmRestartServerReq {
  confirmationPhrase?: string;
  confirmPhrase?: string;
}

/** GM 环境变量重载响应。 */
export interface GmReloadEnvironmentVarsRes {
  ok: true;
  reloadedAt: number;
  count: number;
}

// ─── GM 游戏配置中心 ───

/** 游戏配置值类型。 */
export type GameConfigValueType = 'boolean' | 'number' | 'string';

/** 游戏配置列表项。 */
export interface GameConfigItem {
  key: string;
  label: string;
  description: string;
  category: string;
  valueType: GameConfigValueType;
  /** 当前生效值（来自 process.env）。 */
  currentValue: string;
  /** 数据库中保存的值（下次重启生效）；null 表示未设置。 */
  pendingValue: string | null;
  /** 注册表默认值。 */
  defaultValue: string;
  /** 是否有待重启生效的变更。 */
  pendingRestart: boolean;
  /** 最小值（仅 number 类型）。 */
  min?: number;
  /** 最大值（仅 number 类型）。 */
  max?: number;
}

/** 游戏配置列表响应。 */
export interface GameConfigListRes {
  items: GameConfigItem[];
  checkedAt: number;
}

/** 设置游戏配置请求。 */
export interface GameConfigSetReq {
  value: string;
}

/** 设置游戏配置响应。 */
export interface GameConfigSetRes {
  ok: true;
  key: string;
  value: string;
  pendingRestart: true;
}

/** 删除游戏配置响应（恢复默认）。 */
export interface GameConfigDeleteRes {
  ok: true;
  key: string;
  restoredDefault: string;
}

// ─── GM AI Provider 配置 ───

/** GM AI 配置用途。 */
export type GmAiProviderKind = 'text' | 'image';

/** GM 文本模型 provider。 */
export type GmAiTextProvider = 'openai' | 'openai-compatible' | 'anthropic';

/** GM 图像模型 provider。 */
export type GmAiImageProvider = 'openai' | 'dashscope';

/** GM AI provider 下挂模型来源。 */
export type GmAiProviderModelSource = 'manual' | 'fetched' | 'legacy';

/** GM AI provider 下挂模型项。 */
export interface GmAiProviderModelItem {
  name: string;
  enabled: boolean;
  source: GmAiProviderModelSource;
  addedAt: string;
}

/** GM AI provider 配置列表项；不包含 API Key 明文。 */
export interface GmAiProviderConfigItem {
  scope: string;
  kind: GmAiProviderKind;
  provider: GmAiTextProvider | GmAiImageProvider;
  baseURL: string;
  /** 默认模型名；兼容旧调用路径，通常等于 models 中第一个启用项。 */
  modelName: string;
  models: GmAiProviderModelItem[];
  timeoutMs: number;
  imageSize: string;
  imageQuality: string;
  secretKeyRef: string;
  secretConfigured: boolean;
  enabled: boolean;
  revision: number;
  updatedBy: string;
  updatedAt: string;
}

/** GM AI provider 配置列表响应。 */
export interface GmAiProviderConfigListRes {
  items: GmAiProviderConfigItem[];
  checkedAt: number;
  secretStoreAvailable: boolean;
}

/** GM AI provider 配置保存请求。apiKey 只写入 GM 密钥表，不进入普通配置表。 */
export interface GmAiProviderConfigSetReq {
  provider: GmAiTextProvider | GmAiImageProvider;
  baseURL: string;
  modelName?: string;
  models?: GmAiProviderModelItem[];
  timeoutMs?: number;
  imageSize?: string;
  imageQuality?: string;
  secretKeyRef: string;
  apiKey?: string;
  enabled?: boolean;
}

/** GM AI provider 配置保存响应。 */
export interface GmAiProviderConfigSetRes {
  ok: true;
  item: GmAiProviderConfigItem;
  secretWritten: boolean;
}

/** GM AI provider 配置删除响应。 */
export interface GmAiProviderConfigDeleteRes {
  ok: true;
  deleted: boolean;
}

/** GM AI provider 拉取模型列表响应。 */
export interface GmAiProviderFetchModelsRes {
  ok: true;
  models: GmAiProviderModelItem[];
  fetchedCount: number;
}

/** GM AI provider 单模型删除响应。 */
export interface GmAiProviderDeleteModelRes {
  ok: true;
  item: GmAiProviderConfigItem;
  deleted: boolean;
}

/** GM AI provider 单模型测试响应。 */
export interface GmAiProviderTestModelRes {
  ok: boolean;
  scope: string;
  kind: GmAiProviderKind;
  modelName: string;
  latencyMs: number;
  message: string;
}
