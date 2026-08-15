import assert from 'node:assert/strict';
import { withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:CHAT-CHANNEL-SLOTS:PASS';

await withClientBrowserProof(
  { viewport: { width: 1280, height: 800 }, profilePrefix: 'chat-channel-slots-proof-' },
  async (cdp) => {
    const result = await cdp.evaluate(String.raw`
      (async () => {
        const buildStaticPanel = () => {
          document.getElementById('chat-panel')?.remove();
          const panel = document.createElement('div');
          panel.id = 'chat-panel';
          panel.innerHTML = '<div class="section-tabs chat-tabs">'
            + '<button data-chat-fixed-channel="system" data-chat-unread-host="system">系统</button>'
            + '<button data-chat-fixed-channel="combat" data-chat-unread-host="combat">战斗</button>'
            + ['channel-1', 'channel-2', 'channel-3'].map((slot) => '<label data-chat-slot-host="' + slot + '" data-chat-unread-host="' + slot + '"><select data-chat-slot-select="' + slot + '">'
              + ['grudge', 'nearby', 'world', 'sect', 'party'].map((channel) => '<option value="' + channel + '">' + channel + '</option>').join('')
              + '</select></label>').join('')
            + '</div><div class="chat-log-stack">'
            + ['system', 'combat', 'grudge', 'nearby', 'world', 'sect', 'party'].map((channel) => '<div data-chat-pane="' + channel + '"><div class="chat-log"></div></div>').join('')
            + '</div><div class="chat-compose"><input id="chat-input"><button id="chat-send" type="button">发送</button></div>';
          document.body.appendChild(panel);
          return panel;
        };

        const { CHAT_CHANNEL_SLOT_STORAGE_KEY } = await import('/src/constants/ui/chat.ts');
        const { ChatUI } = await import('/src/ui/chat.ts');
        localStorage.removeItem(CHAT_CHANNEL_SLOT_STORAGE_KEY);
        buildStaticPanel();
        const chat = new ChatUI();
        chat.setPersistenceScope('player-1|map-1|instance-1|sect-1');
        chat.setLogbookVisible(true);
        const selects = Array.from(document.querySelectorAll('[data-chat-slot-select]'));
        const defaults = selects.map((select) => select.value);
        const fixedCount = document.querySelectorAll('[data-chat-fixed-channel]').length;
        const optionCounts = selects.map((select) => select.options.length);

        const sent = [];
        const partyUnread = [];
        chat.setPartySendCallback((text) => sent.push(text));
        chat.setPartyUnreadCallback((count) => partyUnread.push(count));
        selects[0].value = 'party';
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        const persistedAfterSwitch = JSON.parse(localStorage.getItem(CHAT_CHANNEL_SLOT_STORAGE_KEY));
        const disabledBeforeParty = document.getElementById('chat-input').disabled;

        const first = { messageId: 'party-message-1', partyId: 'party-1', fromPlayerId: 'player-1', fromName: '我', text: '先行一步', sentAt: 100 };
        chat.syncPartyMessages('party-1', [first], 'player-1');
        const input = document.getElementById('chat-input');
        input.value = '统一面板发言';
        document.getElementById('chat-send').click();

        selects[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
        selects[1].focus();
        const second = { messageId: 'party-message-2', partyId: 'party-1', fromPlayerId: 'player-2', fromName: '道友乙', text: '收到', sentAt: 200 };
        const incoming = chat.syncPartyMessages('party-1', [first, second], 'player-1', second);
        const partyBadge = document.querySelector('[data-chat-slot-host="channel-1"] [data-chat-unread]');
        const unreadWhileHidden = { hidden: partyBadge.hidden, text: partyBadge.textContent, notify: incoming.notify };
        chat.openChannel('party');
        const unreadAfterOpen = { hidden: partyBadge.hidden, latest: partyUnread.at(-1) };
        const partyLines = document.querySelectorAll('[data-chat-pane="party"] .chat-line').length;
        chat.setPersistenceScope('player-1|map-2|instance-2|sect-1');
        const partyLinesAfterCrossMap = document.querySelectorAll('[data-chat-pane="party"] .chat-line').length;
        chat.setPersistenceScope('player-2|map-1|instance-1|sect-1');
        const partyLinesAfterPlayerSwitch = document.querySelectorAll('[data-chat-pane="party"] .chat-line').length;
        const partyDisabledAfterPlayerSwitch = document.getElementById('chat-input').disabled;

        buildStaticPanel();
        const restoredChat = new ChatUI();
        const restored = Array.from(document.querySelectorAll('[data-chat-slot-select]')).map((select) => select.value);
        restoredChat.syncPartyMessages(null, [], null);
        return {
          defaults,
          fixedCount,
          optionCounts,
          persistedAfterSwitch,
          disabledBeforeParty,
          sent,
          unreadWhileHidden,
          unreadAfterOpen,
          partyLines,
          partyLinesAfterCrossMap,
          partyLinesAfterPlayerSwitch,
          partyDisabledAfterPlayerSwitch,
          restored,
        };
      })()
    `);

    assert.deepEqual(result.defaults, ['grudge', 'nearby', 'world'], '三个频道槽默认值错误');
    assert.equal(result.fixedCount, 2, '系统/战斗固定页应保留');
    assert.deepEqual(result.optionCounts, [5, 5, 5], '每个频道槽必须可选五类聊天');
    assert.equal(result.persistedAfterSwitch['channel-1'], 'party', '频道切换未写入 localStorage');
    assert.equal(result.disabledBeforeParty, true, '无队伍时队伍频道输入应禁用');
    assert.deepEqual(result.sent, ['统一面板发言'], '队伍频道未走统一输入框发送');
    assert.deepEqual(result.unreadWhileHidden, { hidden: false, text: '1', notify: true }, '队伍频道未读未映射到频道槽');
    assert.deepEqual(result.unreadAfterOpen, { hidden: true, latest: 0 }, '打开队伍频道后未清除未读');
    assert.equal(result.partyLines, 2, '队伍消息未渲染到日志与聊天面板');
    assert.equal(result.partyLinesAfterCrossMap, 2, '同一角色跨图后队伍消息未保留');
    assert.equal(result.partyLinesAfterPlayerSwitch, 0, '切换角色后仍残留上一角色队伍消息');
    assert.equal(result.partyDisabledAfterPlayerSwitch, true, '切换角色后仍可向上一角色队伍发送消息');
    assert.deepEqual(result.restored, ['party', 'nearby', 'world'], '重建聊天面板后未恢复本地频道选择');
  },
);

console.log(MARKER);
