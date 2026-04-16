import { detailModalHost } from './detail-modal-host';
import { CHANGELOG_ENTRIES, getLatestChangelogEntry } from './changelog-data';

/** ChangelogPanel：Changelog面板实现。 */
export class ChangelogPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'changelog-panel';

  constructor() {
    document.getElementById('hud-open-chronicle')?.addEventListener('click', () => this.open());
  }

  /** open：打开open。 */
  open(): void {
    detailModalHost.open({
      ownerId: ChangelogPanel.MODAL_OWNER,
      title: '岁月史书',
      subtitle: this.buildSubtitle(),
      hint: '点击空白处关闭',
      renderBody: (body) => {
        this.renderBody(body);
      },
    });
  }

  /** buildSubtitle：构建Subtitle。 */
  private buildSubtitle(): string {
    const latest = getLatestChangelogEntry();
    return latest ? `最近记载：${latest.updatedAt}` : '暂无记载';
  }

  /** renderBody：渲染身体。 */
  private renderBody(body: HTMLElement): void {
    const shell = createElement('div', 'chronicle-shell');
    const historySection = createElement('section', 'panel-section chronicle-history');
    const sectionTitle = createElement('div', 'panel-section-title', '更新日志');
    const entryList = createElement('div', 'chronicle-entry-list');
    for (const entry of CHANGELOG_ENTRIES) {
      entryList.append(this.renderEntry(entry));
    }
    historySection.append(sectionTitle, entryList);
    shell.append(historySection);
    body.replaceChildren(shell);
  }

  /** renderEntry：渲染条目。 */
  private renderEntry(entry: { updatedAt: string; summary: string; items: string[] }): HTMLElement {
    const article = createElement('article', 'chronicle-entry');
    const head = createElement('div', 'chronicle-entry-head');
    head.append(
      createElement('div', 'chronicle-entry-time', entry.updatedAt),
      createElement('div', 'chronicle-entry-summary', entry.summary),
    );
    const list = createElement('ul', 'chronicle-entry-items');
    for (const item of entry.items) {
      list.append(createElement('li', '', item));
    }
    article.append(head, list);
    return article;
  }
}

/** createElement：创建文本元素。 */
function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (typeof text === 'string') {
    element.textContent = text;
  }
  return element;
}

