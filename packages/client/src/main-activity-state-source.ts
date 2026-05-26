/**
 * 活动中心状态源。
 *
 * 只缓存服务端下发的低频活动视图，不在客户端复刻奖励判定。
 */
import type { ActivityOperationResultView, ActivityStatusView } from '@mud/shared';
import { ActivityPanel } from './ui/activity-panel';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';

type MainActivityStateSourceOptions = {
  socket: Pick<SocketSocialEconomySender, 'sendRequestActivityStatus' | 'sendClaimMeritMonthCard' | 'sendClaimDailySignIn'>;
  isSocketConnected: () => boolean;
  sendUseItem: (itemInstanceId: string) => void;
};

export function createMainActivityStateSource(options: MainActivityStateSourceOptions) {
  const activityPanel = new ActivityPanel({
    socket: options.socket,
    isConnected: options.isSocketConnected,
    sendUseItem: options.sendUseItem,
  });
  return {
    init(): void {
      activityPanel.init();
    },
    handleActivityStatus(status: ActivityStatusView): void {
      activityPanel.handleStatus(status);
    },
    handleActivityOperationResult(result: ActivityOperationResultView): void {
      void result;
      activityPanel.handleOperationResult();
    },
    clear(): void {
      activityPanel.clear();
    },
  };
}

export type MainActivityStateSource = ReturnType<typeof createMainActivityStateSource>;
