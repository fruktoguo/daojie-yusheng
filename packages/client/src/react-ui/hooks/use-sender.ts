/**
 * Network hooks：封装 socket sender 为 React 可用的引用
 * 
 * 通过 bridge 注入 sender 引用，React 组件通过 hook 获取类型安全的发送方法
 */
import type { SocketRuntimeSender } from '../../network/socket-send-runtime';
import type { SocketPanelSender } from '../../network/socket-send-panel';
import type { SocketSocialEconomySender } from '../../network/socket-send-social-economy';
import type { SocketAdminSender } from '../../network/socket-send-admin';
import type { SocketBuildingSender } from '../../network/socket-send-building';

/** 所有 sender 引用的容器 */
interface SenderRefs {
  runtime: SocketRuntimeSender | null;
  panel: SocketPanelSender | null;
  socialEconomy: SocketSocialEconomySender | null;
  admin: SocketAdminSender | null;
  building: SocketBuildingSender | null;
}

/** 全局 sender 引用（由 bridge 注入） */
const senderRefs: SenderRefs = {
  runtime: null,
  panel: null,
  socialEconomy: null,
  admin: null,
  building: null,
};

/** Bridge 调用：注入 sender 引用 */
export function injectSenders(senders: Partial<SenderRefs>): void {
  if (senders.runtime) senderRefs.runtime = senders.runtime;
  if (senders.panel) senderRefs.panel = senders.panel;
  if (senders.socialEconomy) senderRefs.socialEconomy = senders.socialEconomy;
  if (senders.admin) senderRefs.admin = senders.admin;
  if (senders.building) senderRefs.building = senders.building;
}

/** 获取 runtime sender（移动、战斗、基础操作） */
export function useRuntimeSender(): SocketRuntimeSender {
  if (!senderRefs.runtime) {
    throw new Error('[react-ui] runtime sender not injected');
  }
  return senderRefs.runtime;
}

/** 获取 panel sender（面板请求） */
export function usePanelSender(): SocketPanelSender {
  if (!senderRefs.panel) {
    throw new Error('[react-ui] panel sender not injected');
  }
  return senderRefs.panel;
}

/** 获取 social economy sender（市场、邮件、交易） */
export function useSocialEconomySender(): SocketSocialEconomySender {
  if (!senderRefs.socialEconomy) {
    throw new Error('[react-ui] socialEconomy sender not injected');
  }
  return senderRefs.socialEconomy;
}

/** 获取 admin sender（GM 操作） */
export function useAdminSender(): SocketAdminSender {
  if (!senderRefs.admin) {
    throw new Error('[react-ui] admin sender not injected');
  }
  return senderRefs.admin;
}

/** 获取 building sender（建筑操作） */
export function useBuildingSender(): SocketBuildingSender {
  if (!senderRefs.building) {
    throw new Error('[react-ui] building sender not injected');
  }
  return senderRefs.building;
}
