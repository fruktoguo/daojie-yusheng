/**
 * 前端版本探测与强制刷新常量。
 */

/** 构建版本文件路径。 */
export const CLIENT_BUILD_VERSION_PATH = '/version.json';

/** 轮询前端版本的间隔。 */
export const CLIENT_BUILD_POLL_INTERVAL_MS = 30_000;

/** 拉取版本文件的超时时间。 */
export const CLIENT_BUILD_REQUEST_TIMEOUT_MS = 5_000;

/** 检测到新版本后，给提示留出的最短刷新延迟。 */
export const CLIENT_BUILD_RELOAD_DELAY_MS = 1_200;

/** 避免同一版本刷新死循环的会话存储键。 */
export const CLIENT_BUILD_LAST_FORCED_RELOAD_ID_STORAGE_KEY = 'mud:client:last-forced-build-id';

/** 记录最近一次强制刷新时间的会话存储键。 */
export const CLIENT_BUILD_LAST_FORCED_RELOAD_AT_STORAGE_KEY = 'mud:client:last-forced-build-at';

/** 同一版本的强制刷新冷却时间，避免异常配置时无限刷新。 */
export const CLIENT_BUILD_FORCED_RELOAD_COOLDOWN_MS = 15_000;

/** 强制刷新时追加到 URL 的版本参数名。 */
export const CLIENT_BUILD_RELOAD_VERSION_QUERY_KEY = '__build';

/** 强制刷新时追加到 URL 的时间参数名。 */
export const CLIENT_BUILD_RELOAD_TIME_QUERY_KEY = '__reloadAt';
