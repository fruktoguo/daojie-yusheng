/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 *
 * 此文件已拆分为多个领域子模块，本文件作为 re-export barrel 保持调用点零改动。
 */
export {
    buildBootstrapPanelDelta,
    buildFullPanelDelta,
    buildFullPanelDeltaFromState,
    buildFullSelfDelta,
    buildFullSelfDeltaFromState,
    buildFullWorldDelta,
    buildFullWorldDeltaFromState,
    buildMapEnter,
    captureWorldState,
} from './world-projector.world-delta.helpers';

export {
    capturePlayerState,
    captureSelfState,
    capturePanelState,
    buildPanelCursor,
    captureProjectorState,
    combineProjectorState,
} from './world-projector.panel-slices.helpers';

export {
    buildPanelDelta,
    buildPanelUpdate,
    buildSelfDelta,
    buildPanelDeltaFromCursor,
} from './world-projector.deltas.helpers';

export {
    diffContainerEntries,
    diffBuildingEntries,
    diffFormationEntries,
    diffGroundPiles,
    diffMonsterEntries,
    diffNpcEntries,
    diffPlayerEntries,
    diffPortalEntries,
} from './projector-diff';
