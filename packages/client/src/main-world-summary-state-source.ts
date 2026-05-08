import { S2C_Leaderboard, S2C_LeaderboardPlayerLocations, S2C_WorldSummary } from '@mud/shared';
import type { SocketPanelSender } from './network/socket-send-panel';
import { detailModalHost } from './ui/detail-modal-host';
import { preserveSelection } from './ui/selection-preserver';
import { WorldPanel } from './ui/panels/world-panel';
import { formatDisplayInteger } from './utils/number';
import { t } from './ui/i18n';
/**
 * MainWorldSummaryStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainWorldSummaryStateSourceOptions = {
/**
 * socket：socket相关字段。
 */

  socket: Pick<SocketPanelSender, 'sendRequestLeaderboard' | 'sendRequestLeaderboardPlayerLocations' | 'sendRequestWorldSummary'>;  
  /**
 * worldPanel：世界面板相关字段。
 */

  worldPanel: Pick<WorldPanel, 'setCallbacks'>;
};

const LEADERBOARD_MODAL_OWNER = 'world:leaderboard';
const WORLD_SUMMARY_MODAL_OWNER = 'world:summary';
const LEADERBOARD_PLAYER_LOCATION_REFRESH_INTERVAL_MS = 10_000;
const LEADERBOARD_PLAYER_LOCATION_EVENT = 'mud:leaderboard-player-locations';

type LeaderboardTab = 'realm' | 'monsterKills' | 'spiritStones' | 'playerKills' | 'deaths' | 'bodyTraining' | 'supremeAttrs' | 'sects';

const LEADERBOARD_LIMIT = 10;
function getLeaderboardTabLabel(tab: LeaderboardTab): string {
  switch (tab) {
    case 'realm':
      return t('world-summary.leaderboard.tab.realm', undefined);
    case 'monsterKills':
      return t('world-summary.leaderboard.tab.monster-kills', undefined);
    case 'spiritStones':
      return t('world-summary.leaderboard.tab.spirit-stones', undefined);
    case 'playerKills':
      return t('world-summary.leaderboard.tab.player-kills', undefined);
    case 'deaths':
      return t('world-summary.leaderboard.tab.deaths', undefined);
    case 'bodyTraining':
      return t('world-summary.leaderboard.tab.body-training', undefined);
    case 'supremeAttrs':
      return t('world-summary.leaderboard.tab.supreme-attrs', undefined);
    case 'sects':
      return t('world-summary.leaderboard.tab.sects', undefined);
  }
}

const LEADERBOARD_TABS: LeaderboardTab[] = ['realm', 'monsterKills', 'spiritStones', 'playerKills', 'deaths', 'bodyTraining', 'supremeAttrs', 'sects'];
/**
 * cloneJson：构建Json。
 * @param value T 参数说明。
 * @returns 返回Json。
 */


function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
/**
 * escapeHtml：执行escapeHtml相关逻辑。
 * @param value string 参数说明。
 * @returns 返回escapeHtml。
 */


function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
/**
 * formatLeaderboardGeneratedAt：规范化或转换LeaderboardGeneratedAt。
 * @param timestamp number 参数说明。
 * @returns 返回LeaderboardGeneratedAt。
 */


function formatLeaderboardGeneratedAt(timestamp: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return t('world-summary.generated-at.loading', undefined);
  }
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}
/**
 * MainWorldSummaryStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainWorldSummaryStateSource = ReturnType<typeof createMainWorldSummaryStateSource>;
/**
 * createMainWorldSummaryStateSource：构建并返回目标对象。
 * @param options MainWorldSummaryStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新Main世界摘要状态来源相关状态。
 */


export function createMainWorldSummaryStateSource(options: MainWorldSummaryStateSourceOptions) {
  let latestLeaderboard: S2C_Leaderboard | null = null;
  let latestWorldSummary: S2C_WorldSummary | null = null;  
  let leaderboardPlayerLocationById = new Map<string, S2C_LeaderboardPlayerLocations['entries'][number]>();
  let leaderboardLocationTimer: number | null = null;
  let activeLeaderboardTab: LeaderboardTab = 'realm';
  let leaderboardLoading = false;
  let worldSummaryLoading = false;

  function emitLeaderboardPlayerLocations(): void {
    window.dispatchEvent(new CustomEvent(LEADERBOARD_PLAYER_LOCATION_EVENT, {
      detail: {
        entries: [...leaderboardPlayerLocationById.values()].map((entry) => cloneJson(entry)),
      },
    }));
  }
  /**
 * renderLeaderboardModal：执行Leaderboard弹层相关逻辑。
 * @returns 无返回值，直接更新Leaderboard弹层相关状态。
 */


  function renderLeaderboardModal(): void {
    const data = latestLeaderboard;
    const limit = data?.limit ?? LEADERBOARD_LIMIT;
    const modalOptions = {
      ownerId: LEADERBOARD_MODAL_OWNER,
      variantClass: 'detail-modal--leaderboard',
      title: t('world-summary.leaderboard.title', undefined),
      subtitle: t('world-summary.leaderboard.subtitle', { limit: formatDisplayInteger(limit), time: formatLeaderboardGeneratedAt(data?.generatedAt ?? 0) }),
      hint: t('world-summary.modal.hint.close-outside', undefined),
      bodyHtml: renderLeaderboardModalBody(data),
      onAfterRender: bindLeaderboardModalEvents,
      onClose: () => {
        stopLeaderboardLocationPolling();
      },
    };
    if (!detailModalHost.patch(modalOptions)) {
      detailModalHost.open(modalOptions);
    }
    requestVisibleLeaderboardPlayerLocations();
  }
  /**
 * renderWorldSummaryModal：执行世界摘要弹层相关逻辑。
 * @returns 无返回值，直接更新世界摘要弹层相关状态。
 */


  function renderWorldSummaryModal(): void {
    const data = latestWorldSummary;
    const modalOptions = {
      ownerId: WORLD_SUMMARY_MODAL_OWNER,
      variantClass: 'detail-modal--leaderboard',
      title: t('world-summary.summary.title', undefined),
      subtitle: t('world-summary.summary.subtitle', { time: formatLeaderboardGeneratedAt(data?.generatedAt ?? 0) }),
      hint: t('world-summary.modal.hint.close-outside', undefined),
      bodyHtml: renderWorldSummaryModalBody(data),
      onAfterRender: bindWorldSummaryModalEvents,
    };
    if (!detailModalHost.patch(modalOptions)) {
      detailModalHost.open(modalOptions);
    }
  }

  options.worldPanel.setCallbacks({
    onOpenLeaderboard: () => {
      openLeaderboardModal();
    },
    onOpenWorldSummary: () => {
      openWorldSummaryModal();
    },
  });

  return {  
  /**
 * init：执行init相关逻辑。
 * @returns 无返回值，直接更新init相关状态。
 */

    init(): void {
      options.socket.sendRequestLeaderboard();
      options.socket.sendRequestWorldSummary();
    },    
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      latestLeaderboard = null;
      latestWorldSummary = null;
      leaderboardPlayerLocationById.clear();
      emitLeaderboardPlayerLocations();
      stopLeaderboardLocationPolling();
      detailModalHost.close(LEADERBOARD_MODAL_OWNER);
      detailModalHost.close(WORLD_SUMMARY_MODAL_OWNER);
    },    
    /**
 * handleLeaderboard：处理Leaderboard并更新相关状态。
 * @param data S2C_Leaderboard 原始数据。
 * @returns 无返回值，直接更新Leaderboard相关状态。
 */


    handleLeaderboard(data: S2C_Leaderboard): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      latestLeaderboard = cloneJson(data);
      leaderboardLoading = false;
      if (detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER)) {
        renderLeaderboardModal();
      }
    },    
    /**
 * handleLeaderboardPlayerLocations：处理玩家击杀榜坐标追索结果并更新相关状态。
 * @param data S2C_LeaderboardPlayerLocations 原始数据。
 * @returns 无返回值，直接更新玩家击杀榜坐标追索结果相关状态。
 */

    handleLeaderboardPlayerLocations(data: S2C_LeaderboardPlayerLocations): void {
      leaderboardPlayerLocationById = new Map(data.entries.map((entry) => [entry.playerId, cloneJson(entry)]));
      emitLeaderboardPlayerLocations();
      if (!detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER)) {
        return;
      }
      if (activeLeaderboardTab === 'playerKills') {
        patchLeaderboardPlayerLocationTexts();
      }
    },    
    /**
 * handleWorldSummary：处理世界摘要并更新相关状态。
 * @param data S2C_WorldSummary 原始数据。
 * @returns 无返回值，直接更新世界摘要相关状态。
 */


    handleWorldSummary(data: S2C_WorldSummary): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      latestWorldSummary = cloneJson(data);
      worldSummaryLoading = false;
      if (detailModalHost.isOpenFor(WORLD_SUMMARY_MODAL_OWNER)) {
        renderWorldSummaryModal();
      }
    },
  };

  function startLeaderboardLocationPolling(): void {
    if (leaderboardLocationTimer !== null) {
      return;
    }
    leaderboardLocationTimer = window.setInterval(() => {
      requestVisibleLeaderboardPlayerLocations();
    }, LEADERBOARD_PLAYER_LOCATION_REFRESH_INTERVAL_MS);
  }

  function stopLeaderboardLocationPolling(): void {
    if (leaderboardLocationTimer === null) {
      return;
    }
    window.clearInterval(leaderboardLocationTimer);
    leaderboardLocationTimer = null;
  }

  function requestVisibleLeaderboardPlayerLocations(): void {
    if (!detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER) || !latestLeaderboard) {
      return;
    }
    const playerIds = latestLeaderboard.boards.playerKills
      .map((entry) => entry.playerId)
      .filter((entry) => typeof entry === 'string' && entry.length > 0);
    if (playerIds.length <= 0) {
      return;
    }
    options.socket.sendRequestLeaderboardPlayerLocations(playerIds);
  }

  function formatLeaderboardPlayerLocation(playerId: string): string {
    const entry = leaderboardPlayerLocationById.get(playerId);
    if (!entry) {
      return t('world-summary.leaderboard.location.loading', undefined);
    }
    return entry.online
      ? t('world-summary.leaderboard.location.online', { mapName: entry.mapName, x: formatDisplayInteger(entry.x), y: formatDisplayInteger(entry.y) })
      : t('world-summary.leaderboard.location.offline', { mapName: entry.mapName, x: formatDisplayInteger(entry.x), y: formatDisplayInteger(entry.y) });
  }

  function openLeaderboardModal(): void {
    leaderboardLoading = true;
    renderLeaderboardModal();
    startLeaderboardLocationPolling();
    options.socket.sendRequestLeaderboard();
  }

  function openWorldSummaryModal(): void {
    worldSummaryLoading = true;
    renderWorldSummaryModal();
    options.socket.sendRequestWorldSummary();
  }

  function renderActiveLeaderboardBoard(data: S2C_Leaderboard | null): string {
    if (!data) {
      return `<div class="empty-hint">${t('world-summary.leaderboard.empty', undefined)}</div>`;
    }
    switch (activeLeaderboardTab) {
      case 'realm':
        return renderStandardLeaderboardList(
          data.boards.realm.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: escapeHtml(entry.realmName),
          })),
        );
      case 'monsterKills':
        return renderStandardLeaderboardList(
          data.boards.monsterKills.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: t('world-summary.leaderboard.value.monster-kills', { count: formatDisplayInteger(entry.totalKills) }),
            meta: t('world-summary.leaderboard.meta.monster-kills', { elite: formatDisplayInteger(entry.eliteKills), boss: formatDisplayInteger(entry.bossKills) }),
          })),
        );
      case 'spiritStones':
        return renderStandardLeaderboardList(
          data.boards.spiritStones.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: t('world-summary.leaderboard.value.spirit-stones', { count: formatDisplayInteger(entry.spiritStoneCount) }),
          })),
        );
      case 'playerKills':
        return renderStandardLeaderboardList(
          data.boards.playerKills.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: t('world-summary.leaderboard.value.player-kills', { count: formatDisplayInteger(entry.playerKillCount) }),
            meta: formatLeaderboardPlayerLocation(entry.playerId),
          })),
        );
      case 'deaths':
        return renderStandardLeaderboardList(
          data.boards.deaths.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: t('world-summary.leaderboard.value.deaths', { count: formatDisplayInteger(entry.deathCount) }),
          })),
        );
      case 'bodyTraining':
        return renderStandardLeaderboardList(
          data.boards.bodyTraining.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: t('world-summary.leaderboard.value.body-training', { level: formatDisplayInteger(entry.level) }),
          })),
        );
      case 'supremeAttrs':
        return renderSupremeAttrBoard(data);
      case 'sects':
        return renderStandardLeaderboardList(
          data.boards.sects.map((entry) => ({
            rank: entry.rank,
            name: entry.mark ? `${entry.mark} ${entry.sectName}` : entry.sectName,
            value: t('world-summary.leaderboard.value.sect-members', { count: formatDisplayInteger(entry.memberCount) }),
            meta: t('world-summary.leaderboard.meta.sect-leader', { leaderName: entry.leaderName }),
          })),
        );
      default:
        return `<div class="empty-hint">${t('world-summary.leaderboard.empty', undefined)}</div>`;
    }
  }

  function renderLeaderboardModalBody(data: S2C_Leaderboard | null): string {
    const tabs = LEADERBOARD_TABS
      .map((tab) => `
        <button
          class="leaderboard-tab-btn ${tab === activeLeaderboardTab ? 'active' : ''}"
          data-leaderboard-tab="${tab}"
          type="button"
        >${getLeaderboardTabLabel(tab)}</button>
      `)
      .join('');
    return `
      <div class="leaderboard-shell">
        <div class="leaderboard-toolbar">
          <div class="leaderboard-tabs">${tabs}</div>
          <div class="leaderboard-toolbar-actions">
            <button class="small-btn ghost" data-open-world-summary type="button">${t('world-summary.action.open-summary', undefined)}</button>
            <button class="small-btn" data-leaderboard-refresh type="button">${leaderboardLoading ? t('world-summary.generated-at.loading', undefined) : t('world-summary.action.refresh-leaderboard', undefined)}</button>
          </div>
        </div>
        <div class="leaderboard-content">
          ${leaderboardLoading && !data ? `<div class="leaderboard-loading">${t('world-summary.leaderboard.loading', undefined)}</div>` : ''}
          <div class="leaderboard-board">${renderActiveLeaderboardBoard(data)}</div>
        </div>
      </div>
    `;
  }

  function renderWorldSummaryModalBody(data: S2C_WorldSummary | null): string {
    return `
      <div class="leaderboard-shell">
        <div class="leaderboard-toolbar">
          <div class="panel-subtext">${t('world-summary.summary.intro', undefined)}</div>
          <div class="leaderboard-toolbar-actions">
            <button class="small-btn ghost" data-open-leaderboard type="button">${t('world-summary.action.open-leaderboard', undefined)}</button>
            <button class="small-btn" data-world-summary-refresh type="button">${worldSummaryLoading ? t('world-summary.generated-at.loading', undefined) : t('world-summary.action.refresh-summary', undefined)}</button>
          </div>
        </div>
        <div class="leaderboard-content">
          ${worldSummaryLoading && !data ? `<div class="leaderboard-loading">${t('world-summary.summary.loading', undefined)}</div>` : ''}
          <div class="leaderboard-board">${renderWorldSummaryBoard(data)}</div>
        </div>
      </div>
    `;
  }

  function bindLeaderboardModalEvents(body: HTMLElement, signal: AbortSignal): void {
    body.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const tabButton = target.closest<HTMLElement>('[data-leaderboard-tab]');
      if (tabButton) {
        event.preventDefault();
        event.stopPropagation();
        const tab = tabButton.dataset.leaderboardTab as LeaderboardTab | undefined;
        if (!tab || tab === activeLeaderboardTab) {
          return;
        }
        activeLeaderboardTab = tab;
        renderLeaderboardModal();
        return;
      }
      if (target.closest('[data-leaderboard-refresh]')) {
        event.preventDefault();
        event.stopPropagation();
        leaderboardLoading = true;
        renderLeaderboardModal();
        options.socket.sendRequestLeaderboard();
        return;
      }
      if (target.closest('[data-open-world-summary]')) {
        event.preventDefault();
        event.stopPropagation();
        openWorldSummaryModal();
      }
    }, { signal });
  }

  function bindWorldSummaryModalEvents(body: HTMLElement, signal: AbortSignal): void {
    body.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest('[data-world-summary-refresh]')) {
        event.preventDefault();
        event.stopPropagation();
        worldSummaryLoading = true;
        renderWorldSummaryModal();
        options.socket.sendRequestWorldSummary();
        return;
      }
      if (target.closest('[data-open-leaderboard]')) {
        event.preventDefault();
        event.stopPropagation();
        openLeaderboardModal();
      }
    }, { signal });
  }

  function patchLeaderboardPlayerLocationTexts(): void {
    const body = document.getElementById('detail-modal-body');
    if (!body) {
      return;
    }
    const playerKillEntries = latestLeaderboard?.boards.playerKills ?? [];
    preserveSelection(body, () => {
      const submetaNodes = [...body.querySelectorAll<HTMLElement>('.leaderboard-submeta')];
      playerKillEntries.forEach((entry, index) => {
        const node = submetaNodes[index];
        if (!node) {
          return;
        }
        const nextText = formatLeaderboardPlayerLocation(entry.playerId);
        if (node.textContent === nextText) {
          return;
        }
        node.textContent = nextText;
      });
    });
  }

  function renderStandardLeaderboardList(entries: Array<{
    rank: number;
    name: string;
    value: string;
    meta?: string;
  }>): string {
    if (entries.length === 0) {
      return `<div class="empty-hint">${t('world-summary.leaderboard.empty', undefined)}</div>`;
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

  function renderSupremeAttrBoard(data: S2C_Leaderboard): string {
    if (data.boards.supremeAttrs.length === 0) {
      return `<div class="empty-hint">${t('world-summary.leaderboard.empty', undefined)}</div>`;
    }
    return `
      <div class="leaderboard-supreme-grid">
        ${data.boards.supremeAttrs.map((entry) => `
          <div class="leaderboard-supreme-card">
            <div class="leaderboard-supreme-label">${escapeHtml(entry.label)}</div>
            <div class="leaderboard-supreme-name">${escapeHtml(entry.playerName)}</div>
            <div class="leaderboard-supreme-value">${formatDisplayInteger(entry.value)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderWorldSummaryBoard(data: S2C_WorldSummary | null): string {
    if (!data) {
      return `<div class="empty-hint">${t('world-summary.summary.empty', undefined)}</div>`;
    }
    const summary = data.summary;
    return `
      <div class="leaderboard-world-grid">
        ${renderWorldSection(t('world-summary.section.spirit-stones', undefined), [{
          label: t('world-summary.row.total-spirit-stones', undefined),
          value: t('world-summary.value.spirit-stones', { count: formatDisplayInteger(summary.totalSpiritStones) }),
          hint: t('world-summary.hint.total-spirit-stones', undefined),
        }])}
        ${renderWorldSection(t('world-summary.section.actions', undefined), [
          { label: t('world-summary.row.action.cultivation', undefined), value: t('world-summary.value.people', { count: formatDisplayInteger(summary.actionCounts.cultivation) }) },
          { label: t('world-summary.row.action.combat', undefined), value: t('world-summary.value.people', { count: formatDisplayInteger(summary.actionCounts.combat) }) },
          { label: t('world-summary.row.action.alchemy', undefined), value: t('world-summary.value.people', { count: formatDisplayInteger(summary.actionCounts.alchemy) }) },
          { label: t('world-summary.row.action.enhancement', undefined), value: t('world-summary.value.people', { count: formatDisplayInteger(summary.actionCounts.enhancement) }) },
        ])}
        ${renderWorldSection(t('world-summary.section.realms', undefined), [
          { label: t('world-summary.row.realm.initial', undefined), value: t('world-summary.value.people', { count: formatDisplayInteger(summary.realmCounts.initial) }), hint: 'Lv.1' },
          { label: t('world-summary.row.realm.mortal', undefined), value: t('world-summary.value.people', { count: formatDisplayInteger(summary.realmCounts.mortal) }), hint: 'Lv.2 - Lv.18' },
          { label: t('world-summary.row.realm.qi-refining-or-above', undefined), value: t('world-summary.value.people', { count: formatDisplayInteger(summary.realmCounts.qiRefiningOrAbove) }), hint: 'Lv.19+' },
        ])}
        ${renderWorldSection(t('world-summary.section.kills-deaths', undefined), [
          { label: t('world-summary.row.kills.normal-monsters', undefined), value: t('world-summary.value.times', { count: formatDisplayInteger(summary.killCounts.normalMonsters) }) },
          { label: t('world-summary.row.kills.elite-monsters', undefined), value: t('world-summary.value.times', { count: formatDisplayInteger(summary.killCounts.eliteMonsters) }) },
          { label: t('world-summary.row.kills.boss-monsters', undefined), value: t('world-summary.value.times', { count: formatDisplayInteger(summary.killCounts.bossMonsters) }) },
          { label: t('world-summary.row.kills.player-kills', undefined), value: t('world-summary.value.times', { count: formatDisplayInteger(summary.killCounts.playerKills) }) },
          { label: t('world-summary.row.kills.player-deaths', undefined), value: t('world-summary.value.times', { count: formatDisplayInteger(summary.killCounts.playerDeaths) }) },
        ])}
      </div>
    `;
  }

  function renderWorldSection(title: string, entries: Array<{ label: string; value: string; hint?: string }>): string {
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
