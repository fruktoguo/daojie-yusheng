/**
 * 聊天面板 UI
 * 管理多频道消息展示、频道切换与消息发送
 */

export class ChatUI {
  private panel = document.getElementById('chat-panel')!;
  private input = document.getElementById('chat-input') as HTMLInputElement;
  private sendBtn = document.getElementById('chat-send')!;
  private tabs = this.panel.querySelectorAll<HTMLElement>('[data-chat-channel]');
  private panes = this.panel.querySelectorAll<HTMLElement>('[data-chat-pane]');
  private onSend: ((message: string) => void) | null = null;

  constructor() {
    this.sendBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.submit();
      } else if (event.key === 'Escape') {
        this.input.blur();
      }
    });
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const channel = tab.dataset.chatChannel;
        if (!channel) return;
        this.switchChannel(channel);
      });
    });
  }

  setCallback(onSend: (message: string) => void): void {
    this.onSend = onSend;
  }

  show(): void {
    this.panel.classList.remove('hidden');
  }

  hide(): void {
    this.panel.classList.add('hidden');
  }

  clear(): void {
    this.switchChannel('world');
    this.panes.forEach((pane) => {
      const log = pane.querySelector<HTMLElement>('.chat-log');
      if (log) {
        log.innerHTML = '';
      }
    });
    this.input.value = '';
  }

  /** 向指定频道追加一条消息，自动限制最大行数 */
  addMessage(text: string, from?: string, kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' = 'system'): void {
    const line = document.createElement('div');
    line.className = `chat-line chat-kind-${kind}`;
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    line.textContent = `${stamp} ${from ? `[${from}] ` : ''}${text}`;

    const channels = this.resolveChannels(kind);
    for (const channel of channels) {
      const pane = this.panel.querySelector<HTMLElement>(`[data-chat-pane="${channel}"]`);
      const log = pane?.querySelector<HTMLElement>('.chat-log');
      if (!log) continue;
      log.appendChild(line.cloneNode(true));
      while (log.childElementCount > 80) {
        log.firstElementChild?.remove();
      }
      log.scrollTop = log.scrollHeight;
    }
  }

  private resolveChannels(kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot'): string[] {
    const channels = ['world'];
    if (kind === 'chat') {
      channels.push('map');
    } else {
      channels.push('system');
    }
    return channels;
  }

  private switchChannel(channel: string): void {
    this.tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.chatChannel === channel);
    });
    this.panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.chatPane === channel);
    });
  }

  private submit(): void {
    const message = this.input.value.trim();
    if (!message) return;
    this.onSend?.(message);
    this.input.value = '';
  }
}
