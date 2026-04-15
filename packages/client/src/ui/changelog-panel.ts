// TODO(next:UI06): 把 changelog-panel 的模板化装载保持在低频前提下继续收口到统一 modal recipe，减少孤立 UI 壳体。
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
      bodyHtml: this.buildBodyHtml(),
    });
  }

  /** buildSubtitle：构建Subtitle。 */
  private buildSubtitle(): string {
    const latest = getLatestChangelogEntry();
    return latest ? `最近记载：${latest.updatedAt}` : '暂无记载';
  }

  /** buildBodyHtml：构建身体Html。 */
  private buildBodyHtml(): string {
    return `
      <div class="chronicle-shell">
        <section class="panel-section chronicle-history">
          <div class="panel-section-title">更新日志</div>
          <div class="chronicle-entry-list">
            ${CHANGELOG_ENTRIES.map((entry) => this.renderEntry(entry)).join('')}
          </div>
        </section>
      </div>
    `;
  }

  /** renderEntry：渲染条目。 */
  private renderEntry(entry: { updatedAt: string; summary: string; items: string[] }): string {
    return `
      <article class="chronicle-entry">
        <div class="chronicle-entry-head">
          <div class="chronicle-entry-time">${escapeHtml(entry.updatedAt)}</div>
          <div class="chronicle-entry-summary">${escapeHtml(entry.summary)}</div>
        </div>
        <ul class="chronicle-entry-items">
          ${entry.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </article>
    `;
  }
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


