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

let initialized = false;
let currentConfig = cloneConfig(DEFAULT_MAP_PERFORMANCE_CONFIG);

export type { MapPerformanceConfig };
export { MAP_PERFORMANCE_CONFIG_CHANGE_EVENT };

export function initializeMapPerformanceConfig(): MapPerformanceConfig {
  if (initialized) {
    return cloneConfig(currentConfig);
  }
  currentConfig = normalizeConfig(readStoredConfig());
  initialized = true;
  return cloneConfig(currentConfig);
}

export function getMapPerformanceConfig(): MapPerformanceConfig {
  if (!initialized) {
    return initializeMapPerformanceConfig();
  }
  return cloneConfig(currentConfig);
}

export function updateMapPerformanceConfig(patch: Partial<MapPerformanceConfig>): MapPerformanceConfig {
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

export function resetMapPerformanceConfig(): MapPerformanceConfig {
  initialized = true;
  currentConfig = cloneConfig(DEFAULT_MAP_PERFORMANCE_CONFIG);
  persistConfig(currentConfig);
  window.dispatchEvent(new CustomEvent<MapPerformanceConfig>(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, {
    detail: cloneConfig(currentConfig),
  }));
  return cloneConfig(currentConfig);
}

function normalizeConfig(raw: Partial<MapPerformanceConfig> | null | undefined): MapPerformanceConfig {
  return {
    showFpsMonitor: raw?.showFpsMonitor === true,
  };
}

function persistConfig(config: MapPerformanceConfig): void {
  try {
    window.localStorage.setItem(MAP_PERFORMANCE_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 本地存储不可用时静默跳过，保留当前会话内配置
  }
}

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

function cloneConfig(config: MapPerformanceConfig): MapPerformanceConfig {
  return {
    showFpsMonitor: config.showFpsMonitor,
  };
}
