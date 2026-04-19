/**
 * 地图性能设置。
 * 负责本地存储持久化和变更广播。
 */

import {
  DEFAULT_MAP_PERFORMANCE_CONFIG,
  MAP_PERFORMANCE_CONFIG_CHANGE_EVENT,
  MAP_TARGET_FPS_RANGE,
  MAP_PERFORMANCE_STORAGE_KEY,
  type MapPerformanceConfig,
} from '../constants/ui/performance';

/** initialized：定义该变量以承载业务值。 */
let initialized = false;
/** currentConfig：定义该变量以承载业务值。 */
let currentConfig = cloneConfig(DEFAULT_MAP_PERFORMANCE_CONFIG);

export type { MapPerformanceConfig };
export { MAP_PERFORMANCE_CONFIG_CHANGE_EVENT };

/** initializeMapPerformanceConfig：执行对应的业务逻辑。 */
export function initializeMapPerformanceConfig(): MapPerformanceConfig {
  if (initialized) {
    return cloneConfig(currentConfig);
  }
  currentConfig = normalizeConfig(readStoredConfig());
  initialized = true;
  return cloneConfig(currentConfig);
}

/** getMapPerformanceConfig：执行对应的业务逻辑。 */
export function getMapPerformanceConfig(): MapPerformanceConfig {
  if (!initialized) {
    return initializeMapPerformanceConfig();
  }
  return cloneConfig(currentConfig);
}

/** updateMapPerformanceConfig：执行对应的业务逻辑。 */
export function updateMapPerformanceConfig(patch: Partial<MapPerformanceConfig>): MapPerformanceConfig {
  initialized = true;
/** previousConfig：定义该变量以承载业务值。 */
  const previousConfig = currentConfig;
  currentConfig = normalizeConfig({
    ...currentConfig,
    ...patch,
  });
  persistConfig(currentConfig);
  if (
    previousConfig.showFpsMonitor !== currentConfig.showFpsMonitor
    || previousConfig.targetFps !== currentConfig.targetFps
  ) {
    window.dispatchEvent(new CustomEvent<MapPerformanceConfig>(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, {
      detail: cloneConfig(currentConfig),
    }));
  }
  return cloneConfig(currentConfig);
}

/** resetMapPerformanceConfig：执行对应的业务逻辑。 */
export function resetMapPerformanceConfig(): MapPerformanceConfig {
  initialized = true;
  currentConfig = cloneConfig(DEFAULT_MAP_PERFORMANCE_CONFIG);
  persistConfig(currentConfig);
  window.dispatchEvent(new CustomEvent<MapPerformanceConfig>(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, {
    detail: cloneConfig(currentConfig),
  }));
  return cloneConfig(currentConfig);
}

/** normalizeConfig：执行对应的业务逻辑。 */
function normalizeConfig(raw: Partial<MapPerformanceConfig> | null | undefined): MapPerformanceConfig {
/** parsedTargetFps：定义该变量以承载业务值。 */
  const parsedTargetFps = Number.parseInt(String(raw?.targetFps ?? ''), 10);
  return {
/** showFpsMonitor：定义该变量以承载业务值。 */
    showFpsMonitor: raw?.showFpsMonitor === true,
    targetFps: Number.isFinite(parsedTargetFps)
      ? Math.max(MAP_TARGET_FPS_RANGE.min, Math.min(MAP_TARGET_FPS_RANGE.max, parsedTargetFps))
      : MAP_TARGET_FPS_RANGE.defaultValue,
  };
}

/** persistConfig：执行对应的业务逻辑。 */
function persistConfig(config: MapPerformanceConfig): void {
  try {
    window.localStorage.setItem(MAP_PERFORMANCE_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 本地存储不可用时静默跳过，保留当前会话内配置
  }
}

/** readStoredConfig：执行对应的业务逻辑。 */
function readStoredConfig(): Partial<MapPerformanceConfig> | null {
  try {
/** raw：定义该变量以承载业务值。 */
    const raw = window.localStorage.getItem(MAP_PERFORMANCE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
/** parsed：定义该变量以承载业务值。 */
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Partial<MapPerformanceConfig>;
  } catch {
    return null;
  }
}

/** cloneConfig：执行对应的业务逻辑。 */
function cloneConfig(config: MapPerformanceConfig): MapPerformanceConfig {
  return {
    showFpsMonitor: config.showFpsMonitor,
    targetFps: config.targetFps,
  };
}
