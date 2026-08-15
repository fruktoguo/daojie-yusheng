/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { memo } from 'react';
import type { ChatChannel } from '../../../constants/ui/chat';
import {
  CHAT_CHANNELS,
  CHAT_CHANNEL_SLOT_IDS,
  CHAT_FIXED_CHANNELS,
  CHAT_SELECTABLE_CHANNELS,
  DEFAULT_CHAT_CHANNEL,
  DEFAULT_CHAT_CHANNEL_SLOT,
  DEFAULT_CHAT_CHANNEL_SLOTS,
} from '../../../constants/ui/chat';
import { t } from '../../../ui/i18n';

const CHANNEL_LABEL_KEYS: Record<ChatChannel, string> = {
  system: 'shell.chat-system',
  combat: 'shell.chat-combat',
  grudge: 'shell.chat-grudge',
  nearby: 'shell.chat-nearby',
  world: 'shell.chat-world',
  sect: 'shell.chat-sect',
  party: 'shell.chat-party',
};

const SLOT_LABELS = ['频道一', '频道二', '频道三'] as const;

export const ChatPanel = memo(function ChatPanel() {
  return (
    <>
      <div className="section-tabs chat-tabs" data-react-chat-tabs="true" aria-label="日志与聊天频道">
        {CHAT_FIXED_CHANNELS.map((channel) => (
          <button
            key={channel}
            className="tab-btn"
            data-chat-fixed-channel={channel}
            data-chat-unread-host={channel}
            type="button"
          >
            {t(CHANNEL_LABEL_KEYS[channel], undefined)}
          </button>
        ))}
        {CHAT_CHANNEL_SLOT_IDS.map((slotId, index) => (
          <label
            key={slotId}
            className={`chat-channel-slot${slotId === DEFAULT_CHAT_CHANNEL_SLOT ? ' active' : ''}`}
            data-chat-slot-host={slotId}
            data-chat-unread-host={slotId}
          >
            <span className="sr-only">{SLOT_LABELS[index]}</span>
            <select
              className="tab-btn chat-channel-select"
              data-chat-slot-select={slotId}
              defaultValue={DEFAULT_CHAT_CHANNEL_SLOTS[slotId]}
              aria-label={`${SLOT_LABELS[index]}，切换频道`}
            >
              {CHAT_SELECTABLE_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {t(CHANNEL_LABEL_KEYS[channel], undefined)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="section-body flush chat-log-stack" data-react-chat-log-stack="true">
        {CHAT_CHANNELS.map((channel) => (
          <div
            key={channel}
            className={`chat-log-panel${channel === DEFAULT_CHAT_CHANNEL ? ' active' : ''}`}
            data-chat-pane={channel}
          >
            <div className="chat-log" />
          </div>
        ))}
      </div>
      <div className="chat-compose" data-react-chat-compose="true">
        <input
          id="chat-input"
          type="text"
          maxLength={200}
          placeholder={t('shell.chat-input.placeholder', undefined)}
        />
        <button id="chat-send" className="action-btn primary-btn" style={{ flex: '0 0 92px' }} type="button">
          <span className="btn-text">{t('shell.send', undefined)}</span>
          <span className="btn-border" />
        </button>
      </div>
    </>
  );
});
