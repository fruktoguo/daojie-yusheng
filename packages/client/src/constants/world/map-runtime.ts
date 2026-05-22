/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import type { MapSafeAreaInsets } from '../../game-map/types';

export const DEFAULT_SAFE_AREA: MapSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
