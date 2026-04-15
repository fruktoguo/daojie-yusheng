import {
  LeaderboardBodyTrainingEntry,
  LeaderboardDeathEntry,
  LeaderboardMonsterKillEntry,
  LeaderboardPlayerKillEntry,
  LeaderboardRealmEntry,
  LeaderboardSpiritStoneEntry,
  LeaderboardSupremeAttrEntry,
  S2C_Leaderboard,
} from '@mud/shared';
import { formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

type LeaderboardTab = 'realm' | 'monsterKills' | 'spiritStones' | 'playerKills' | 'deaths' | 'bodyTraining' | 'supremeAttrs';

const LEADERBOARD_OWNER_ID = 'leaderboard-modal';
const LEADERBOARD_LIMIT = 10;

const LEADERBOARD_TAB_LABELS: Record<LeaderboardTab, string> = {
  realm: '境界',
  monsterKills: '斩妖',
  spiritStones: '灵石',
  playerKills: '杀伐',
  deaths: '身陨',
  bodyTraining: '炼体',
  supremeAttrs: '四维最强',
};


function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatGeneratedAt：格式化输出字符串用于展示。 */
function formatGeneratedAt(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '调卷中';
  }
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

export class LeaderboardModal {
  private data: S2C_Leaderboard | null = null;
  private activeTab: LeaderboardTab = 'realm';
  private loading = false;
  private requestData: ((limit: number) => void) | null = null;

  setCallbacks(callbacks: {
    onRequestData: (limit: number) => void;
  }): void {
    this.requestData = callbacks.onRequestData;
  }

/** open：打开界面或流程。 */
  open(): void {
    this.loading = true;
    this.render();
    this.requestData?.(LEADERBOARD_LIMIT);
  }


  applyData(data: S2C_Leaderboard): void {
    this.data = data;
    this.loading = false;
    if (detailModalHost.isOpenFor(LEADERBOARD_OWNER_ID)) {
      this.render();
    }
  }

/** render：渲染当前界面内容。 */
  private render(): void {
    detailModalHost.open({
      ownerId: LEADERBOARD_OWNER_ID,
      variantClass: 'detail-modal--leaderboard',
      title: '排行榜',
      subtitle: this.buildSubtitle(),
      hint: '点击空白处关闭',
      bodyHtml: this.renderBodyHtml(),
      onAfterRender: (body) => {
        body.querySelectorAll<HTMLButtonElement>('[data-leaderboard-tab]').forEach((button) => {
          button.addEventListener('click', () => {
            const tab = button.dataset.leaderboardTab as LeaderboardTab | undefined;
            if (!tab || tab === this.activeTab) {
              return;
            }
            this.activeTab = tab;
            this.render();
          });
        });
        body.querySelectorAll<HTMLButtonElement>('[data-leaderboard-refresh]').forEach((button) => {
          button.addEventListener('click', () => {
            this.loading = true;
            this.render();
            this.requestData?.(LEADERBOARD_LIMIT);
          });
        });
      },
    });
  }

  private buildSubtitle(): string {
    const limit = this.data?.limit ?? LEADERBOARD_LIMIT;
    const generatedAt = formatGeneratedAt(this.data?.generatedAt);
    return `收录前 ${formatDisplayInteger(limit)} 名 · 十分钟一更 · ${generatedAt}`;
  }

/** renderBodyHtml：渲染当前界面内容。 */
  private renderBodyHtml(): string {
    const tabs = (Object.keys(LEADERBOARD_TAB_LABELS) as LeaderboardTab[])
      .map((tab) => `
        <button
          class="leaderboard-tab-btn ${tab === this.activeTab ? 'active' : ''}"
          data-leaderboard-tab="${tab}"
          type="button"
        >${LEADERBOARD_TAB_LABELS[tab]}</button>
      `)
      .join('');

    return `
      <div class="leaderboard-shell">
        <div class="leaderboard-toolbar">
          <div class="leaderboard-tabs">${tabs}</div>
          <button class="small-btn" data-leaderboard-refresh type="button">${this.loading ? '调卷中' : '刷新榜册'}</button>
        </div>
        <div class="leaderboard-content">
          ${this.loading && !this.data ? '<div class="leaderboard-loading">天机阁正在调阅最新榜册……</div>' : ''}
          <div class="leaderboard-board">${this.renderActiveBoard()}</div>
        </div>
      </div>
    `;
  }

/** renderActiveBoard：渲染当前界面内容。 */
  private renderActiveBoard(): string {
    if (!this.data) {
      return '<div class="empty-hint">暂无榜册内容。</div>';
    }
    switch (this.activeTab) {
      case 'realm':
        return this.renderRealmBoard(this.data.boards.realm);
      case 'monsterKills':
        return this.renderMonsterKillBoard(this.data.boards.monsterKills);
      case 'spiritStones':
        return this.renderSpiritStoneBoard(this.data.boards.spiritStones);
      case 'playerKills':
        return this.renderPlayerKillBoard(this.data.boards.playerKills);
      case 'deaths':
        return this.renderDeathBoard(this.data.boards.deaths);
      case 'bodyTraining':
        return this.renderBodyTrainingBoard(this.data.boards.bodyTraining);
      case 'supremeAttrs':
        return this.renderSupremeAttrBoard(this.data.boards.supremeAttrs);
      default:
        return '<div class="empty-hint">暂无榜册内容。</div>';
    }
  }

/** renderRealmBoard：渲染当前界面内容。 */
  private renderRealmBoard(entries: LeaderboardRealmEntry[]): string {
    return this.renderStandardList(
      entries.map((entry) => ({
        rank: entry.rank,
        name: entry.playerName,
        value: escapeHtml(entry.realmName),
      })),
    );
  }

/** renderMonsterKillBoard：渲染当前界面内容。 */
  private renderMonsterKillBoard(entries: LeaderboardMonsterKillEntry[]): string {
    return this.renderStandardList(
      entries.map((entry) => ({
        rank: entry.rank,
        name: entry.playerName,
        value: `击杀 ${formatDisplayInteger(entry.totalKills)}`,
        meta: `精英 ${formatDisplayInteger(entry.eliteKills)} · Boss ${formatDisplayInteger(entry.bossKills)}`,
      })),
    );
  }

/** renderSpiritStoneBoard：渲染当前界面内容。 */
  private renderSpiritStoneBoard(entries: LeaderboardSpiritStoneEntry[]): string {
    return this.renderStandardList(
      entries.map((entry) => ({
        rank: entry.rank,
        name: entry.playerName,
        value: `${formatDisplayInteger(entry.spiritStoneCount)} 灵石`,
      })),
    );
  }

/** renderPlayerKillBoard：渲染当前界面内容。 */
  private renderPlayerKillBoard(entries: LeaderboardPlayerKillEntry[]): string {
    return this.renderStandardList(
      entries.map((entry) => ({
        rank: entry.rank,
        name: entry.playerName,
        value: `击杀玩家 ${formatDisplayInteger(entry.playerKillCount)}`,
      })),
    );
  }

/** renderDeathBoard：渲染当前界面内容。 */
  private renderDeathBoard(entries: LeaderboardDeathEntry[]): string {
    return this.renderStandardList(
      entries.map((entry) => ({
        rank: entry.rank,
        name: entry.playerName,
        value: `死亡 ${formatDisplayInteger(entry.deathCount)}`,
      })),
    );
  }

/** renderBodyTrainingBoard：渲染当前界面内容。 */
  private renderBodyTrainingBoard(entries: LeaderboardBodyTrainingEntry[]): string {
    return this.renderStandardList(
      entries.map((entry) => ({
        rank: entry.rank,
        name: entry.playerName,
        value: `炼体 ${formatDisplayInteger(entry.level)} 层`,
      })),
    );
  }

/** renderSupremeAttrBoard：渲染当前界面内容。 */
  private renderSupremeAttrBoard(entries: LeaderboardSupremeAttrEntry[]): string {
    if (entries.length === 0) {
      return '<div class="empty-hint">暂无榜册内容。</div>';
    }
    return `
      <div class="leaderboard-supreme-grid">
        ${entries.map((entry) => `
          <div class="leaderboard-supreme-card">
            <div class="leaderboard-supreme-label">${escapeHtml(entry.label)}</div>
            <div class="leaderboard-supreme-name">${escapeHtml(entry.playerName)}</div>
            <div class="leaderboard-supreme-value">${formatDisplayInteger(entry.value)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderStandardList(entries: Array<{
    rank: number;
    name: string;
    value: string;
    meta?: string;
  }>): string {
    if (entries.length === 0) {
      return '<div class="empty-hint">暂无榜册内容。</div>';
    }
    return `
      <div class="leaderboard-list">
        ${entries.map((entry) => `
          <div class="leaderboard-row">
            <div class="leaderboard-rank">#${formatDisplayInteger(entry.rank)}</div>
            <div class="leaderboard-main">
              <div class="leaderboard-name">${escapeHtml(entry.name)}</div>
              <div class="leaderboard-meta">${entry.value}</div>
              ${entry.meta ? `<div class="leaderboard-submeta">${escapeHtml(entry.meta)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}
