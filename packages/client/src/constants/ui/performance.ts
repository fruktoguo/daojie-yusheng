/**
 * 地图性能设置与 FPS 采样常量。
 */

export type MapPerformanceConfig = {
/** showFpsMonitor：定义该变量以承载业务值。 */
  showFpsMonitor: boolean;
/** targetFps：定义该变量以承载业务值。 */
  targetFps: number;
};

/** 地图性能配置的本地存储键。 */
export const MAP_PERFORMANCE_STORAGE_KEY = 'mud:map-performance-config:v2';

/** 地图性能配置变更事件。 */
export const MAP_PERFORMANCE_CONFIG_CHANGE_EVENT = 'mud:map-performance-config-change';

/** 默认地图性能配置。 */
export const DEFAULT_MAP_PERFORMANCE_CONFIG: MapPerformanceConfig = {
  showFpsMonitor: false,
  targetFps: 60,
};

/** 地图渲染帧率允许范围。 */
export const MAP_TARGET_FPS_RANGE = {
  min: 1,
  max: 240,
  defaultValue: DEFAULT_MAP_PERFORMANCE_CONFIG.targetFps,
} as const;

/** FPS 浮层统计更新频率。 */
export const MAP_FPS_SAMPLE_INTERVAL_MS = 500;

/** FPS 浮层保留的最近帧时间窗口。 */
export const MAP_FPS_SAMPLE_WINDOW_SIZE = 240;
