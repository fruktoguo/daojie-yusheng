/**
 * 本文件负责服务端运行配置的解析或角色判断，是启动期配置边界的一部分。
 *
 * 维护时要让默认值对生产环境友好，并避免把临时本地配置误当作线上真源。
 */
/**
 * 游戏配置注册表：定义所有可通过 GM 面板管理的运行时配置项。
 * 这些配置存储在数据库中，启动时加载到 process.env，重启后生效。
 *
 * 与 GmRuntimeFlagPersistenceService 的区别：
 * - runtime_flag：热生效的布尔开关（maintenance、combat_audit 等）
 * - game_config：重启生效的调参项（worker 数、超时、buffer 大小等）
 */

export type GameConfigValueType = 'boolean' | 'number' | 'string';

export interface GameConfigDescriptor {
  key: string;
  label: string;
  description: string;
  category: string;
  valueType: GameConfigValueType;
  defaultValue: string;
  /** 最小值（仅 number 类型） */
  min?: number;
  /** 最大值（仅 number 类型） */
  max?: number;
}

export const GAME_CONFIG_CATEGORY_ORDER = [
  '并发与线程池',
  '会话与缓冲',
  'Outbox 派发',
  '节点注册',
  '调试与限制',
] as const;

const descriptors: GameConfigDescriptor[] = [
  // ─── 并发与线程池 ───
  { key: 'SERVER_INSTANCE_WORKER_COUNT', label: '实例 Worker 数', description: '实例 worker 线程数上限。', category: '并发与线程池', valueType: 'number', defaultValue: '6', min: 1, max: 8 },
  { key: 'SERVER_PERSISTENCE_WORKER_COUNT', label: '持久化 Worker 数', description: '持久化 worker 线程数上限。', category: '并发与线程池', valueType: 'number', defaultValue: '4', min: 1, max: 8 },
  { key: 'SERVER_WORKER_POOL_FORCE_SYNC', label: '强制同步 Worker', description: '调试时强制 worker pool 同步执行，禁用多线程。', category: '并发与线程池', valueType: 'boolean', defaultValue: 'false' },

  // ─── 会话与缓冲 ───
  { key: 'SERVER_SESSION_DETACH_EXPIRE_MS', label: '会话分离过期', description: '会话分离后的过期时间（毫秒）。', category: '会话与缓冲', valueType: 'number', defaultValue: '30000', min: 1000, max: 300000 },
  { key: 'SERVER_SESSION_REAPER_MAX_RETRIES', label: '会话回收重试', description: '会话回收最大重试次数。', category: '会话与缓冲', valueType: 'number', defaultValue: '3', min: 1, max: 20 },
  { key: 'SERVER_CONSOLE_LOG_BUFFER_LINES', label: '控制台日志缓存行数', description: '控制台日志缓冲保留行数。', category: '会话与缓冲', valueType: 'number', defaultValue: '2000', min: 100, max: 50000 },

  // ─── Outbox 派发 ───
  { key: 'SERVER_OUTBOX_DISPATCH_INTERVAL_MS', label: 'Outbox 派发间隔', description: 'Outbox 派发间隔（毫秒）。', category: 'Outbox 派发', valueType: 'number', defaultValue: '250', min: 100, max: 60000 },
  { key: 'SERVER_OUTBOX_DISPATCH_BATCH_SIZE', label: 'Outbox 批量大小', description: '每次派发的批量大小。', category: 'Outbox 派发', valueType: 'number', defaultValue: '128', min: 1, max: 500 },
  { key: 'SERVER_OUTBOX_RETRY_DELAY_MS', label: 'Outbox 重试延迟', description: 'Outbox 重试延迟（毫秒）。', category: 'Outbox 派发', valueType: 'number', defaultValue: '5000', min: 500, max: 120000 },
  { key: 'SERVER_OUTBOX_MAX_ATTEMPTS', label: 'Outbox 最大重试', description: 'Outbox 最大重试次数。', category: 'Outbox 派发', valueType: 'number', defaultValue: '8', min: 1, max: 50 },
  { key: 'SERVER_OUTBOX_RUNTIME_ENABLED', label: '启用 Outbox Runtime', description: '是否启用 Outbox 运行时。', category: 'Outbox 派发', valueType: 'boolean', defaultValue: 'true' },

  // ─── 节点注册 ───
  { key: 'SERVER_NODE_HEARTBEAT_INTERVAL_MS', label: '节点心跳间隔', description: '节点心跳间隔（毫秒）。', category: '节点注册', valueType: 'number', defaultValue: '5000', min: 1000, max: 60000 },
  { key: 'SERVER_NODE_SUSPECT_AFTER_MS', label: '节点疑似超时', description: '节点进入疑似失联的时间阈值（毫秒）。', category: '节点注册', valueType: 'number', defaultValue: '15000', min: 3000, max: 120000 },
  { key: 'SERVER_NODE_DEAD_AFTER_MS', label: '节点死亡超时', description: '节点进入死亡态的时间阈值（毫秒）。', category: '节点注册', valueType: 'number', defaultValue: '30000', min: 5000, max: 300000 },

  // ─── 调试与限制 ───
  { key: 'SERVER_GM_NETWORK_PERF_ENABLED', label: 'GM 网络性能统计', description: '启用 GM 网络性能聚合统计。', category: '调试与限制', valueType: 'boolean', defaultValue: 'true' },
  { key: 'SERVER_GM_NETWORK_PERF_RESET_INTERVAL_MS', label: 'GM 网络统计重置间隔', description: 'GM 网络统计重置间隔（毫秒）。', category: '调试与限制', valueType: 'number', defaultValue: '60000', min: 5000, max: 600000 },
  { key: 'SERVER_DEBUG_MOVEMENT', label: '移动调试', description: '开启移动调试日志。', category: '调试与限制', valueType: 'boolean', defaultValue: 'false' },
  { key: 'SERVER_HEAP_SNAPSHOT_TOP_LIMIT', label: 'Heap Snapshot 上限', description: 'Heap snapshot 排名前列保留数量。', category: '调试与限制', valueType: 'number', defaultValue: '20', min: 1, max: 200 },
  { key: 'SERVER_BUILDING_OPERATION_RESULTS_LIMIT', label: '建筑结果上限', description: '建筑操作结果的保留上限。', category: '调试与限制', valueType: 'number', defaultValue: '100', min: 10, max: 5000 },
  { key: 'SERVER_FLUSH_WAKEUP_KEY_LIMIT', label: 'Flush Wakeup 上限', description: '唤醒刷盘 key 数量上限。', category: '调试与限制', valueType: 'number', defaultValue: '20000', min: 128, max: 100000 },
];

export const GAME_CONFIG_DESCRIPTOR_MAP = new Map(descriptors.map((d) => [d.key, d]));

export function getGameConfigDescriptor(key: string): GameConfigDescriptor | null {
  return GAME_CONFIG_DESCRIPTOR_MAP.get(key) ?? null;
}

export function listGameConfigDescriptors(): GameConfigDescriptor[] {
  return descriptors;
}

export function getGameConfigCategoryOrder(category: string): number {
  const index = GAME_CONFIG_CATEGORY_ORDER.indexOf(category as typeof GAME_CONFIG_CATEGORY_ORDER[number]);
  return index === -1 ? 999 : index;
}
