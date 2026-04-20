import { NEXT_S2C_Notice, NEXT_S2C_NoticeItem, NEXT_S2C_SystemMsg } from '@mud/shared-next';
import { ChatUI } from './ui/chat';
/**
 * MainToastKind：统一结构类型，保证协议与运行时一致性。
 */


type MainToastKind = 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';
/**
 * MainNoticeStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainNoticeStateSourceOptions = {
/**
 * chatUI：chatUI相关字段。
 */

  chatUI: Pick<ChatUI, 'addMessage'>;  
  /**
 * ackSystemMessages：ackSystemMessage相关字段。
 */

  ackSystemMessages: (ids: string[]) => void;  
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string, kind?: MainToastKind) => void;  
  /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

  clearCurrentPath: () => void;
};
/**
 * resolveSystemMsgIdFromNextNotice：规范化或转换SystemMsgIDFromNextNotice。
 * @param item NEXT_S2C_NoticeItem 道具。
 * @returns 返回SystemMsgIDFromNextNotice。
 */


function resolveSystemMsgIdFromNextNotice(item: NEXT_S2C_NoticeItem): string | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof item.messageId === 'string' && item.messageId.length > 0) {
    return item.messageId;
  }
  return typeof item.id === 'number' ? String(item.id) : undefined;
}
/**
 * toSystemMsgFromNextNotice：执行toSystemMsgFromNextNotice相关逻辑。
 * @param item NEXT_S2C_NoticeItem 道具。
 * @returns 返回toSystemMsgFromNextNotice。
 */


function toSystemMsgFromNextNotice(item: NEXT_S2C_NoticeItem): NEXT_S2C_SystemMsg {
  const kind = item.kind === 'chat'
    ? 'chat'
    : item.kind === 'grudge'
      ? 'grudge'
      : item.kind === 'quest'
        ? 'quest'
        : item.kind === 'loot'
          ? 'loot'
          : item.kind === 'combat'
            ? 'combat'
            : item.kind === 'success'
              ? 'success'
              : item.kind === 'warn'
                ? 'warn'
                : item.kind === 'travel'
                  ? 'travel'
                  : 'system';
  return {
    id: resolveSystemMsgIdFromNextNotice(item),
    text: item.text,
    kind,
    from: item.from,
    occurredAt: item.occurredAt,
    persistUntilAck: item.persistUntilAck,
  };
}
/**
 * MainNoticeStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainNoticeStateSource = ReturnType<typeof createMainNoticeStateSource>;
/**
 * createMainNoticeStateSource：构建并返回目标对象。
 * @param options MainNoticeStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainNotice状态来源相关状态。
 */


export function createMainNoticeStateSource(options: MainNoticeStateSourceOptions) {
  return {  
  /**
 * handleSystemMsg：处理SystemMsg并更新相关状态。
 * @param data NEXT_S2C_SystemMsg 原始数据。
 * @returns 无返回值，直接更新SystemMsg相关状态。
 */

    handleSystemMsg(data: NEXT_S2C_SystemMsg): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (data.kind === 'chat') {
        void options.chatUI.addMessage(data.text, data.from, data.kind);
        return;
      }
      if (data.kind === 'grudge') {
        void options.chatUI.addMessage(data.text, data.from ?? '情仇', data.kind, {
          id: data.id,
          at: data.occurredAt,
        }).then((stored) => {
          if (stored && data.persistUntilAck === true && data.id) {
            options.ackSystemMessages([data.id]);
          }
        });
        options.showToast(data.text, data.kind);
        return;
      }
      if (data.kind === 'quest' || data.kind === 'combat' || data.kind === 'loot') {
        const label = data.from ?? (data.kind === 'quest' ? '任务' : data.kind === 'combat' ? '战斗' : '掉落');
        void options.chatUI.addMessage(data.text, label, data.kind);
        if (data.kind === 'quest' || data.kind === 'loot') {
          options.showToast(data.text, data.kind);
        }
        return;
      }
      if (data.kind === 'success' || data.kind === 'warn' || data.kind === 'travel') {
        const label = data.from ?? (data.kind === 'success' ? '提示' : data.kind === 'warn' ? '警告' : '行旅');
        void options.chatUI.addMessage(data.text, label, data.kind);
        options.showToast(data.text, data.kind);
        return;
      }
      const fallbackKind = data.kind === 'info' ? 'system' : data.kind ?? 'system';
      void options.chatUI.addMessage(data.text, data.from ?? '系统', fallbackKind);
      if (data.text === '无法到达该位置' || data.text === '目标过远，无法规划路径') {
        options.clearCurrentPath();
      }
      options.showToast(data.text, fallbackKind);
    },    
    /**
 * handleNotice：处理Notice并更新相关状态。
 * @param payload NEXT_S2C_Notice 载荷参数。
 * @returns 无返回值，直接更新Notice相关状态。
 */


    handleNotice(payload: NEXT_S2C_Notice): void {
      for (const item of payload.items) {
        this.handleSystemMsg(toSystemMsgFromNextNotice(item));
      }
    },
  };
}
