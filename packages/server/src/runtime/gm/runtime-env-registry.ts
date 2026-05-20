/** GM 游戏运行环境变量注册表。 */
export interface RuntimeEnvDescriptor {
  key: string;
  label: string;
  description: string;
  category: string;
  editable?: boolean;
  persistable?: boolean;
  restartRequired?: boolean;
  sensitive?: boolean;
  hidden?: boolean;
}

export const RUNTIME_ENV_CATEGORY_ORDER = [
  '基础运行',
  '数据存储',
  '网络与会话',
  '并发与队列',
  'GM 与调试',
  '运维与恢复',
] as const;

const hiddenKeys = new Set(['SERVER_GM_PASSWORD', 'GM_PASSWORD']);

const descriptors: RuntimeEnvDescriptor[] = [
  { key: 'SERVER_RUNTIME_ENV', label: '运行环境', description: '服务端运行环境标识。', category: '基础运行', editable: false, persistable: false, restartRequired: true },
  { key: 'APP_ENV', label: '应用环境', description: '应用环境兼容标识。', category: '基础运行', editable: false, persistable: false, restartRequired: true },
  { key: 'NODE_ENV', label: 'Node 环境', description: 'Node.js 运行环境。', category: '基础运行', editable: false, persistable: false, restartRequired: true },
  { key: 'SERVER_PORT', label: '服务端端口', description: 'HTTP/WebSocket 监听端口。', category: '基础运行', restartRequired: true },
  { key: 'SERVER_HOST', label: '服务端监听地址', description: 'HTTP/WebSocket 监听 host。', category: '基础运行', restartRequired: true },
  { key: 'SERVER_URL', label: '服务端公开 URL', description: '对外公开的服务端地址。', category: '基础运行', restartRequired: true },
  { key: 'SERVER_SHADOW_URL', label: '影子验证 URL', description: '影子验证或回放所用地址。', category: '基础运行', restartRequired: true },
  { key: 'SERVER_PUBLIC_HOST', label: '公网 Host', description: '多节点注册时使用的公网 host。', category: '基础运行', restartRequired: true },
  { key: 'SERVER_PUBLIC_PORT', label: '公网端口', description: '多节点注册时使用的公网端口。', category: '基础运行', restartRequired: true },
  { key: 'SERVER_CORS_ORIGINS', label: 'CORS 允许来源', description: '允许访问接口的前端来源列表。', category: '基础运行', restartRequired: true },
  { key: 'SERVER_TRUST_PROXY', label: '信任代理', description: '是否信任反向代理头。', category: '基础运行', restartRequired: false },
  { key: 'SERVER_TRUSTED_PROXIES', label: '可信代理列表', description: '可信代理地址列表。', category: '基础运行', restartRequired: false },

  { key: 'SERVER_DATABASE_URL', label: '数据库 URL', description: '主数据库连接串。', category: '数据存储', sensitive: true, restartRequired: true },
  { key: 'DATABASE_URL', label: '数据库 URL（兼容）', description: '主数据库连接串兼容别名。', category: '数据存储', sensitive: true, restartRequired: true },
  { key: 'SERVER_DATABASE_POOLER_URL', label: '数据库 Pooler URL', description: '数据库连接池地址。', category: '数据存储', sensitive: true, restartRequired: true },
  { key: 'DATABASE_POOLER_URL', label: '数据库 Pooler URL（兼容）', description: '数据库连接池地址兼容别名。', category: '数据存储', sensitive: true, restartRequired: true },
  { key: 'SERVER_REDIS_URL', label: 'Redis URL', description: 'Redis 连接串。', category: '数据存储', sensitive: true, restartRequired: true },
  { key: 'REDIS_URL', label: 'Redis URL（兼容）', description: 'Redis 连接串兼容别名。', category: '数据存储', sensitive: true, restartRequired: true },
  { key: 'SERVER_REDIS_MODE', label: 'Redis 模式', description: 'Redis 模式，例如 standalone / cluster。', category: '数据存储', restartRequired: true },
  { key: 'REDIS_MODE', label: 'Redis 模式（兼容）', description: 'Redis 模式兼容别名。', category: '数据存储', restartRequired: true },

  { key: 'SERVER_INSTANCE_WORKER_COUNT', label: '实例 Worker 数', description: '实例 worker 线程数上限。', category: '并发与队列', restartRequired: true },
  { key: 'SERVER_PERSISTENCE_WORKER_COUNT', label: '持久化 Worker 数', description: '持久化 worker 线程数上限。', category: '并发与队列', restartRequired: true },
  { key: 'SERVER_WORKER_POOL_FORCE_SYNC', label: '强制同步 Worker', description: '调试时强制 worker pool 同步执行。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_NODE_ID', label: '节点 ID', description: '当前服务节点 ID。', category: '并发与队列', restartRequired: true },
  { key: 'SERVER_NODE_HEARTBEAT_INTERVAL_MS', label: '节点心跳间隔', description: '节点心跳间隔，单位毫秒。', category: '并发与队列', restartRequired: true },
  { key: 'SERVER_NODE_SUSPECT_AFTER_MS', label: '节点疑似超时', description: '节点进入疑似失联的时间阈值。', category: '并发与队列', restartRequired: true },
  { key: 'SERVER_NODE_DEAD_AFTER_MS', label: '节点死亡超时', description: '节点进入死亡态的时间阈值。', category: '并发与队列', restartRequired: true },
  { key: 'SERVER_CONSOLE_LOG_BUFFER_LINES', label: '控制台日志缓存行数', description: '控制台日志缓冲保留行数。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_HEAP_SNAPSHOT_TOP_LIMIT', label: 'Heap Snapshot Top Limit', description: 'Heap snapshot 排名前列保留数量。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_BUILDING_OPERATION_RESULTS_LIMIT', label: '建筑结果上限', description: '建筑操作结果的保留上限。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_FLUSH_WAKEUP_KEY_LIMIT', label: 'Flush Wakeup 上限', description: '唤醒刷盘 key 数量上限。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_SESSION_DETACH_EXPIRE_MS', label: '会话分离过期', description: '会话分离后的过期时间。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_SESSION_REAPER_MAX_RETRIES', label: '会话回收重试', description: '会话回收最大重试次数。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_DISPATCHER_ID', label: 'Outbox Dispatcher ID', description: 'Outbox dispatcher 节点标识。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_DISPATCH_INTERVAL_MS', label: 'Outbox 派发间隔', description: 'Outbox 派发间隔毫秒。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_DISPATCH_BATCH_SIZE', label: 'Outbox 批量大小', description: '每次派发的批量大小。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_CONSUMER_ID', label: 'Outbox Consumer ID', description: 'Outbox consumer 节点标识。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_RETRY_DELAY_MS', label: 'Outbox 重试延迟', description: 'Outbox 重试延迟毫秒。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_MAX_ATTEMPTS', label: 'Outbox 最大重试', description: 'Outbox 最大重试次数。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_LOCAL_DEDUPE_LIMIT', label: 'Outbox 本地去重上限', description: 'Outbox 本地去重缓存上限。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_OUTBOX_RUNTIME_ENABLED', label: '启用 Outbox Runtime', description: '是否启用 Outbox 运行时。', category: '并发与队列', restartRequired: false },
  { key: 'SERVER_MAILBOX_CACHE_MAX_PLAYERS', label: '邮箱缓存玩家数', description: '邮箱缓存保留玩家上限。', category: '并发与队列', restartRequired: false },

  { key: 'SERVER_GM_AUTH_SECRET', label: 'GM Token 密钥', description: 'GM access token 签名密钥。', category: 'GM 与调试', sensitive: true, restartRequired: true },
  { key: 'GM_AUTH_SECRET', label: 'GM Token 密钥（兼容）', description: 'GM access token 签名密钥兼容别名。', category: 'GM 与调试', sensitive: true, restartRequired: true },
  { key: 'SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD', label: '允许本地弱密码', description: '仅本地调试允许使用默认 GM 密码。', category: 'GM 与调试', restartRequired: true },
  { key: 'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD', label: '允许本地弱密码（兼容）', description: '仅本地调试允许使用默认 GM 密码。', category: 'GM 与调试', restartRequired: true },
  { key: 'SERVER_GM_TOKEN_EXPIRES_IN', label: 'GM Token 过期时间', description: 'GM token 过期时间，单位秒。', category: 'GM 与调试', restartRequired: true },
  { key: 'GM_TOKEN_EXPIRES_IN', label: 'GM Token 过期时间（兼容）', description: 'GM token 过期时间兼容别名。', category: 'GM 与调试', restartRequired: true },
  { key: 'SERVER_GM_NETWORK_PERF_ENABLED', label: 'GM 网络性能统计', description: '启用 GM 网络性能统计。', category: 'GM 与调试', restartRequired: false },
  { key: 'SERVER_GM_NETWORK_CAPTURE_PAYLOADS', label: 'GM 网络载荷捕获', description: '是否捕获 GM 网络载荷。', category: 'GM 与调试', restartRequired: false },
  { key: 'SERVER_GM_NETWORK_PERF_RESET_INTERVAL_MS', label: 'GM 网络统计重置间隔', description: 'GM 网络统计重置间隔毫秒。', category: 'GM 与调试', restartRequired: false },
  { key: 'SERVER_DEBUG_MOVEMENT', label: '移动调试', description: '开启移动调试。', category: 'GM 与调试', restartRequired: false },
  { key: 'SERVER_PROTOCOL_AUDIT_CASES', label: '协议审计案例', description: '协议审计案例开关。', category: 'GM 与调试', restartRequired: false },
  { key: 'SERVER_COMBAT_AUDIT_ENABLED', label: '战斗审计', description: '开启战斗审计 outbox。', category: 'GM 与调试', restartRequired: false },
  { key: 'SERVER_GM_DATABASE_BACKUP_DIR', label: 'GM 备份目录', description: 'GM 数据库备份目录。', category: 'GM 与调试', restartRequired: false },
  { key: 'GM_DATABASE_BACKUP_DIR', label: 'GM 备份目录（兼容）', description: 'GM 数据库备份目录兼容别名。', category: 'GM 与调试', restartRequired: false },
  { key: 'SERVER_GM_DATABASE_UPLOAD_MAX_BYTES', label: 'GM 上传大小上限', description: 'GM 数据库上传文件大小上限。', category: 'GM 与调试', restartRequired: true },
  { key: 'GM_DATABASE_UPLOAD_MAX_BYTES', label: 'GM 上传大小上限（兼容）', description: 'GM 数据库上传文件大小上限兼容别名。', category: 'GM 与调试', restartRequired: true },
  { key: 'SERVER_RUNTIME_RESTORE_ACTIVE', label: '恢复中标记', description: '内部恢复状态标记，只读。', category: '运维与恢复', editable: false, persistable: false, restartRequired: false },
];

export const RUNTIME_ENV_DESCRIPTOR_MAP = new Map(descriptors.map((item) => [item.key, item]));

export function getRuntimeEnvDescriptor(key: string): RuntimeEnvDescriptor | null {
  return RUNTIME_ENV_DESCRIPTOR_MAP.get(key) ?? null;
}

export function isHiddenRuntimeEnvKey(key: string): boolean {
  return hiddenKeys.has(key);
}

export function isSensitiveRuntimeEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  return RUNTIME_ENV_DESCRIPTOR_MAP.get(key)?.sensitive === true
    || upper.includes('PASSWORD')
    || upper.includes('SECRET')
    || upper.includes('TOKEN')
    || upper.endsWith('_KEY');
}

export function listManagedRuntimeEnvKeys(): string[] {
  return descriptors.filter((item) => !item.hidden).map((item) => item.key);
}

export function getRuntimeEnvCategoryOrder(category: string): number {
  const index = RUNTIME_ENV_CATEGORY_ORDER.indexOf(category as typeof RUNTIME_ENV_CATEGORY_ORDER[number]);
  return index === -1 ? 999 : index;
}
