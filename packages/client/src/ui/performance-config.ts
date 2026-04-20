/**
 * 地图性能设置。
 * 负责本地存储持久化和变更广播。
 */

import {
  DEFAULT_MAP_PERFORMANCE_CONFIG,
  MAP_PERFORMANCE_CONFIG_CHANGE_EVENT,
  MAP_PERFORMANCE_STORAGE_KEY,
  type MapPerformanceConfig,
} from '../constants/ui/performance';

/** initialized：initialized。 */
let initialized = false;
/** currentConfig：当前配置。 */
let currentConfig = cloneConfig(DEFAULT_MAP_PERFORMANCE_CONFIG);

export type { MapPerformanceConfig };
export { MAP_PERFORMANCE_CONFIG_CHANGE_EVENT };

/** initializeMapPerformanceConfig：初始化地图性能配置。 */
export function initializeMapPerformanceConfig(): MapPerformanceConfig {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (initialized) {
    return cloneConfig(currentConfig);
  }
  /** currentConfig：当前配置。 */
  currentConfig = normalizeConfig(readStoredConfig());
  /** initialized：initialized。 */
  initialized = true;
  return cloneConfig(currentConfig);
}

/** getMapPerformanceConfig：读取地图性能配置。 */
export function getMapPerformanceConfig(): MapPerformanceConfig {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!initialized) {
    return initializeMapPerformanceConfig();
  }
  return cloneConfig(currentConfig);
}

/** updateMapPerformanceConfig：更新地图性能配置。 */
export function updateMapPerformanceConfig(patch: Partial<MapPerformanceConfig>): MapPerformanceConfig {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** initialized：initialized。 */
  initialized = true;
  const previousConfig = currentConfig;
  currentConfig = normalizeConfig({
    ...currentConfig,
    ...patch,
  });
  persistConfig(currentConfig);
  if (previousConfig.showFpsMonitor !== currentConfig.showFpsMonitor) {
    window.dispatchEvent(new CustomEvent<MapPerformanceConfig>(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, {
      detail: cloneConfig(currentConfig),
    }));
  }
  return cloneConfig(currentConfig);
}

/** resetMapPerformanceConfig：重置地图性能配置。 */
export function resetMapPerformanceConfig(): MapPerformanceConfig {
  /** initialized：initialized。 */
  initialized = true;
  /** currentConfig：当前配置。 */
  currentConfig = cloneConfig(DEFAULT_MAP_PERFORMANCE_CONFIG);
  persistConfig(currentConfig);
  window.dispatchEvent(new CustomEvent<MapPerformanceConfig>(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, {
    detail: cloneConfig(currentConfig),
  }));
  return cloneConfig(currentConfig);
}

/** normalizeConfig：规范化配置。 */
function normalizeConfig(raw: Partial<MapPerformanceConfig> | null | undefined): MapPerformanceConfig {
  return {
    showFpsMonitor: raw?.showFpsMonitor === true,
  };
}

/** persistConfig：持久化配置。 */
function persistConfig(config: MapPerformanceConfig): void {
  try {
    window.localStorage.setItem(MAP_PERFORMANCE_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 本地存储不可用时静默跳过，保留当前会话内配置
  }
}

/** readStoredConfig：处理read Stored配置。 */
function readStoredConfig(): Partial<MapPerformanceConfig> | null {
  try {
    const raw = window.localStorage.getItem(MAP_PERFORMANCE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as Partial<MapPerformanceConfig>;
  } catch {
    return null;
  }
}

/** cloneConfig：克隆配置。 */
function cloneConfig(config: MapPerformanceConfig): MapPerformanceConfig {
  return {
    showFpsMonitor: config.showFpsMonitor,
  };
}




