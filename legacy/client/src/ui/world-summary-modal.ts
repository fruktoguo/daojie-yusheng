import {
  LeaderboardWorldSummary,
  S2C_WorldSummary,
} from '@mud/shared';
import { formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

/** WORLD_SUMMARY_OWNER_ID：定义该变量以承载业务值。 */
const WORLD_SUMMARY_OWNER_ID = 'world-summary-modal';

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatGeneratedAt：执行对应的业务逻辑。 */
function formatGeneratedAt(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '调卷中';
  }
/** date：定义该变量以承载业务值。 */
  const date = new Date(timestamp);
/** month：定义该变量以承载业务值。 */
  const month = String(date.getMonth() + 1).padStart(2, '0');
/** day：定义该变量以承载业务值。 */
  const day = String(date.getDate()).padStart(2, '0');
/** hour：定义该变量以承载业务值。 */
  const hour = String(date.getHours()).padStart(2, '0');
/** minute：定义该变量以承载业务值。 */
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

/** WorldSummaryModal：封装相关状态与行为。 */
export class WorldSummaryModal {
  private data: S2C_WorldSummary | null = null;
  private loading = false;
  private requestData: (() => void) | null = null;

  setCallbacks(callbacks: {
    onRequestData: () => void;
  }): void {
    this.requestData = callbacks.onRequestData;
  }

/** open：执行对应的业务逻辑。 */
  open(): void {
    this.loading = true;
    this.render();
    this.requestData?.();
  }

/** applyData：执行对应的业务逻辑。 */
  applyData(data: S2C_WorldSummary): void {
    this.data = data;
    this.loading = false;
    if (detailModalHost.isOpenFor(WORLD_SUMMARY_OWNER_ID)) {
      this.render();
    }
  }

/** render：执行对应的业务逻辑。 */
  private render(): void {
    detailModalHost.open({
      ownerId: WORLD_SUMMARY_OWNER_ID,
      variantClass: 'detail-modal--leaderboard',
      title: '世界',
      subtitle: `世界卷宗 · 十分钟一更 · ${formatGeneratedAt(this.data?.generatedAt)}`,
      hint: '点击空白处关闭',
      bodyHtml: this.renderBodyHtml(),
      onAfterRender: (body) => {
        body.querySelectorAll<HTMLButtonElement>('[data-world-summary-refresh]').forEach((button) => {
          button.addEventListener('click', () => {
            this.loading = true;
            this.render();
            this.requestData?.();
          });
        });
      },
    });
  }

/** renderBodyHtml：执行对应的业务逻辑。 */
  private renderBodyHtml(): string {
    return `
      <div class="leaderboard-shell">
        <div class="leaderboard-toolbar">
          <div class="panel-subtext">阁藏天下卷宗，专收全服低频汇总情报。</div>
          <button class="small-btn" data-world-summary-refresh type="button">${this.loading ? '调卷中' : '刷新卷宗'}</button>
        </div>
        <div class="leaderboard-content">
          ${this.loading && !this.data ? '<div class="leaderboard-loading">天机阁正在调阅世界卷宗……</div>' : ''}
          <div class="leaderboard-board">${this.renderSummary()}</div>
        </div>
      </div>
    `;
  }

/** renderSummary：执行对应的业务逻辑。 */
  private renderSummary(): string {
    if (!this.data) {
      return '<div class="empty-hint">暂无世界卷宗。</div>';
    }
    return this.renderWorldBoard(this.data.summary);
  }

/** renderWorldBoard：执行对应的业务逻辑。 */
  private renderWorldBoard(summary: LeaderboardWorldSummary): string {
    return `
      <div class="leaderboard-world-grid">
        ${this.renderWorldSection('灵石总和', [{
          label: '全体玩家持有',
          value: `${formatDisplayInteger(summary.totalSpiritStones)} 灵石`,
          hint: '包含背包、坊市托管仓与求购挂单中冻结的灵石。',
        }])}
        ${this.renderWorldSection('当前行动人数', [
          { label: '修炼', value: `${formatDisplayInteger(summary.actionCounts.cultivation)} 人` },
          { label: '战斗', value: `${formatDisplayInteger(summary.actionCounts.combat)} 人` },
          { label: '炼丹', value: `${formatDisplayInteger(summary.actionCounts.alchemy)} 人` },
          { label: '强化', value: `${formatDisplayInteger(summary.actionCounts.enhancement)} 人` },
        ])}
        ${this.renderWorldSection('境界人数', [
          { label: '初始境界', value: `${formatDisplayInteger(summary.realmCounts.initial)} 人`, hint: 'Lv.1' },
          { label: '凡人境界', value: `${formatDisplayInteger(summary.realmCounts.mortal)} 人`, hint: 'Lv.2 - Lv.18' },
          { label: '练气及以上', value: `${formatDisplayInteger(summary.realmCounts.qiRefiningOrAbove)} 人`, hint: 'Lv.19+' },
        ])}
        ${this.renderWorldSection('全服击杀与死亡', [
          { label: '普通怪物', value: `${formatDisplayInteger(summary.killCounts.normalMonsters)} 次` },
          { label: '精英怪物', value: `${formatDisplayInteger(summary.killCounts.eliteMonsters)} 次` },
          { label: 'Boss', value: `${formatDisplayInteger(summary.killCounts.bossMonsters)} 次` },
          { label: '玩家击杀玩家', value: `${formatDisplayInteger(summary.killCounts.playerKills)} 次` },
          { label: '玩家死亡', value: `${formatDisplayInteger(summary.killCounts.playerDeaths)} 次` },
        ])}
      </div>
    `;
  }

/** renderWorldSection：执行对应的业务逻辑。 */
  private renderWorldSection(title: string, entries: Array<{ label: string; value: string; hint?: string }>): string {
    return `
      <section class="leaderboard-world-card">
        <div class="leaderboard-world-title">${escapeHtml(title)}</div>
        <div class="leaderboard-world-list">
          ${entries.map((entry) => `
            <div class="leaderboard-world-row">
              <div class="leaderboard-world-copy">
                <div class="leaderboard-world-label">${escapeHtml(entry.label)}</div>
                ${entry.hint ? `<div class="leaderboard-world-hint">${escapeHtml(entry.hint)}</div>` : ''}
              </div>
              <div class="leaderboard-world-value">${escapeHtml(entry.value)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }
}
