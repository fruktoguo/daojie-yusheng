/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 路径高亮与格子淡入效果的视觉常量
 */

/** 路径高亮填充色，用于表示行进路线中的格子 */
export const PATH_FILL_COLOR = 'rgba(88, 180, 214, 0.24)';
/** 路径高亮描边色，用于强化行进路线的轮廓 */
export const PATH_STROKE_COLOR = 'rgba(151, 236, 255, 0.78)';
/** 路径箭头主体色，用于连接路径节点的线段 */
export const PATH_ARROW_COLOR = 'rgba(179, 244, 255, 0.95)';
/** 路径目标格填充色 */
export const PATH_TARGET_FILL_COLOR = 'rgba(244, 144, 64, 0.34)';
/** 路径目标格描边色 */
export const PATH_TARGET_STROKE_COLOR = 'rgba(255, 216, 138, 0.96)';
/** 路径目标核心点的高亮色 */
export const PATH_TARGET_CORE_COLOR = 'rgba(255, 244, 219, 0.98)';
