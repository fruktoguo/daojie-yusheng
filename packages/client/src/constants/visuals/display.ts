/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 显示层级通用常量。
 * 这里保存缩放与格子尺寸的基准值，以利于多处渲染逻辑统一引用。
 */
export const BASE_CELL_SIZE = 32;
/** DEFAULT_ZOOM：缩放默认值。 */
export const DEFAULT_ZOOM = 1;
/** MIN_ZOOM：缩放下限。 */
export const MIN_ZOOM = 0.5;
/** MAX_ZOOM：缩放上限。 */
export const MAX_ZOOM = 4;
/** ZOOM_STEP：缩放STEP。 */
export const ZOOM_STEP = 0.1;



