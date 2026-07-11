/**
 * 本文件属于正式客户端主线，负责前端运行态、状态投影或通用工具。
 *
 * 维护时要区分“显示用派生数据”和“服务端权威数据”，注释只补充边界说明，不改变任何交互语义。
 */
import type { PanelKind, PanelPatch } from '@mud/shared';

export function createMainRuntimeOwnerPatchHandlers() {
  return {
    applyPanelPatch(_patches: Record<PanelKind, PanelPatch>): void {
      // Panel-specific patch consumers will be wired incrementally.
    },
    applyPlayerFeedback(_items: unknown): void {
      // Feedback UI consumer will be wired when the toast/notification system is ready.
    },
    applyJobProgress(_jobs: unknown): void {
      // Job progress UI consumer will be wired when the progress bar component is ready.
    },
  };
}
