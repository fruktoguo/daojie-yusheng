/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { memo } from 'react';
import type { ChatChannel } from '../../../constants/ui/chat';
import { CHAT_CHANNELS, DEFAULT_CHAT_CHANNEL } from '../../../constants/ui/chat';
import { t } from '../../../ui/i18n';

const CHANNEL_LABEL_KEYS: Record<ChatChannel, string> = {
  system: 'shell.chat-system',
  combat: 'shell.chat-combat',
  grudge: 'shell.chat-grudge',
  nearby: 'shell.chat-nearby',
  world: 'shell.chat-world',
  sect: 'shell.chat-sect',
};

export const ChatPanel = memo(function ChatPanel() {
  return (
    <>
      <div className="section-tabs chat-tabs" data-react-chat-tabs="true">
        {CHAT_CHANNELS.map((channel) => (
          <button
            key={channel}
            className={`tab-btn${channel === DEFAULT_CHAT_CHANNEL ? ' active' : ''}`}
            data-chat-channel={channel}
            type="button"
          >
            {t(CHANNEL_LABEL_KEYS[channel], undefined)}
          </button>
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
