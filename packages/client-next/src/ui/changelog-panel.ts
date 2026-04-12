import { detailModalHost } from './detail-modal-host';
import { CHANGELOG_ENTRIES, getLatestChangelogEntry } from './changelog-data';

/** ChangelogPanel：封装相关状态与行为。 */
export class ChangelogPanel {
  private static readonly MODAL_OWNER = 'changelog-panel';

/** constructor：处理当前场景中的对应操作。 */
  constructor() {
    document.getElementById('hud-open-chronicle')?.addEventListener('click', () => this.open());
  }

  open(): void {
    detailModalHost.open({
      ownerId: ChangelogPanel.MODAL_OWNER,
      title: '岁月史书',
      subtitle: this.buildSubtitle(),
      hint: '点击空白处关闭',
      bodyHtml: this.buildBodyHtml(),
    });
  }

  private buildSubtitle(): string {
    const latest = getLatestChangelogEntry();
    return latest ? `最近记载：${latest.updatedAt}` : '暂无记载';
  }

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

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

