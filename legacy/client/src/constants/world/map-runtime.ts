/**
 * 地图运行时通用配置常量。
 * 包括默认安全区域等复用状态，便于客户端多处保持一致。
 */
import type { MapSafeAreaInsets } from '../../game-map/types';

/** DEFAULT_SAFE_AREA：定义该变量以承载业务值。 */
export const DEFAULT_SAFE_AREA: MapSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
