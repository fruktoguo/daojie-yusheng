/**
 * 日志与聊天的三个自定义频道槽偏好。
 *
 * 这里只保存本机显示选择，不参与服务端频道权限或消息路由判定。
 */
import {
  CHAT_CHANNEL_SLOT_IDS,
  CHAT_CHANNEL_SLOT_STORAGE_KEY,
  CHAT_SELECTABLE_CHANNELS,
  DEFAULT_CHAT_CHANNEL_SLOTS,
  type ChatChannelSlotId,
  type ChatChannelSlotSelection,
  type ChatSelectableChannel,
} from '../constants/ui/chat';

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSelectableChannel(value: unknown): value is ChatSelectableChannel {
  return typeof value === 'string'
    && CHAT_SELECTABLE_CHANNELS.includes(value as ChatSelectableChannel);
}

function cloneDefaults(): ChatChannelSlotSelection {
  return { ...DEFAULT_CHAT_CHANNEL_SLOTS };
}

/** 读取本机三个频道槽；损坏或旧格式仅回退对应槽位，不影响其余有效选择。 */
export function loadChatChannelSlots(storage: Storage | null = getLocalStorage()): ChatChannelSlotSelection {
  if (!storage) return cloneDefaults();
  try {
    const parsed = JSON.parse(storage.getItem(CHAT_CHANNEL_SLOT_STORAGE_KEY) ?? 'null') as unknown;
    if (!parsed || typeof parsed !== 'object') return cloneDefaults();
    const candidate = parsed as Partial<Record<ChatChannelSlotId, unknown>>;
    const result = cloneDefaults();
    for (const slotId of CHAT_CHANNEL_SLOT_IDS) {
      if (isSelectableChannel(candidate[slotId])) {
        result[slotId] = candidate[slotId];
      }
    }
    return result;
  } catch {
    return cloneDefaults();
  }
}

/** 保存三个频道槽。写入失败只影响本次持久化，不阻断当前会话切换。 */
export function saveChatChannelSlots(
  selection: ChatChannelSlotSelection,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) return;
  const normalized = cloneDefaults();
  for (const slotId of CHAT_CHANNEL_SLOT_IDS) {
    if (isSelectableChannel(selection[slotId])) {
      normalized[slotId] = selection[slotId];
    }
  }
  try {
    storage.setItem(CHAT_CHANNEL_SLOT_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // 隐私模式或容量不足时保留当前内存选择。
  }
}
