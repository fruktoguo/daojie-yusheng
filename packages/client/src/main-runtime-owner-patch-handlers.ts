/**
 * 本文件属于正式客户端主线，负责前端运行态、状态投影或通用工具。
 *
 * 维护时要区分“显示用派生数据”和“服务端权威数据”，注释只补充边界说明，不改变任何交互语义。
 */
import type { PanelKind, PanelPatch, PlayerState, PlayerStateDelta } from '@mud/shared';

type MainRuntimeOwnerPatchHandlersOptions = {
  getPlayer: () => PlayerState | null;
  setPlayer: (player: PlayerState) => void;
  syncPlayerBridgeState: (player: PlayerState) => void;
};

export function createMainRuntimeOwnerPatchHandlers(options: MainRuntimeOwnerPatchHandlersOptions) {
  return {
    applyPanelPatch(_patches: Record<PanelKind, PanelPatch>): void {
      // Panel-specific patch consumers will be wired incrementally.
    },
    applyStateDelta(delta: PlayerStateDelta): void {
      const player = options.getPlayer();
      if (!player) return;
      if (typeof delta.hp === 'number') player.hp = delta.hp;
      if (typeof delta.mp === 'number') player.qi = delta.mp;
      if (typeof delta.exp === 'number') player.combatExp = delta.exp;
      if (typeof delta.level === 'number') player.foundation = delta.level;
      if (delta.buffs?.removed?.length) {
        const removeSet = new Set(delta.buffs.removed);
        player.temporaryBuffs = (player.temporaryBuffs ?? []).filter((buff) => !removeSet.has(buff.buffId));
      }
      options.setPlayer(player);
      options.syncPlayerBridgeState(player);
    },
    applyPlayerFeedback(_items: unknown): void {
      // Feedback UI consumer will be wired when the toast/notification system is ready.
    },
    applyJobProgress(_jobs: unknown): void {
      // Job progress UI consumer will be wired when the progress bar component is ready.
    },
  };
}
