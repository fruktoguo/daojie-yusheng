/**
 * 地图性能设置与 FPS 采样常量。
 */

export type MapPerformanceConfig = {
/**
 * showFpsMonitor：showFpMonitor相关字段。
 */

  showFpsMonitor: boolean;
};

/** 地图性能配置的本地存储键。 */
export const MAP_PERFORMANCE_STORAGE_KEY = 'mud:map-performance-config:v1';

/** 地图性能配置变更事件。 */
export const MAP_PERFORMANCE_CONFIG_CHANGE_EVENT = 'mud:map-performance-config-change';

/** 默认地图性能配置。 */
export const DEFAULT_MAP_PERFORMANCE_CONFIG: MapPerformanceConfig = {
  showFpsMonitor: false,
};

/** FPS 浮层统计更新频率。 */
export const MAP_FPS_SAMPLE_INTERVAL_MS = 500;

/** FPS 浮层保留的最近帧时间窗口。 */
export const MAP_FPS_SAMPLE_WINDOW_SIZE = 240;
