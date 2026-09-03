/** 副本入口面板的低频状态与意图编排；不承载副本规则或结算逻辑。 */
import {
  DUNGEON_PRESENT_RANK_ORDER,
  S2C,
  formatDisplayInteger,
  resolveDungeonStaminaCost,
  resolveRecoveredStamina,
  type DungeonDifficulty,
  type S2C_DungeonCatalog,
  type TechniqueGrade,
} from '@mud/shared';

import type { ToastKind } from './main-app-assembly-types';
import type { SocketManager } from './network/socket';
import type { SocketDungeonSender } from './network/socket-send-dungeon';
import { detailModalHost } from './ui/detail-modal-host';

type MainDungeonEntrySocket = Pick<SocketManager, 'on'> & {
  dungeon: SocketDungeonSender;
};

type MainDungeonEntrySourceOptions = {
  socket: MainDungeonEntrySocket;
  showToast(message: string, kind?: ToastKind): void;
};

const DUNGEON_MODAL_OWNER = 'dungeon-entry-panel';
const DUNGEON_DIFFICULTY_LABELS: Record<DungeonDifficulty, string> = {
  trial: '试炼',
  hard: '困难',
  nightmare: '噩梦',
  present: '现世',
};
const DUNGEON_RANK_LABELS: Record<TechniqueGrade, string> = {
  mortal: '凡阶',
  yellow: '黄阶',
  mystic: '玄阶',
  earth: '地阶',
  heaven: '天阶',
  spirit: '灵阶',
  saint: '圣阶',
  emperor: '帝阶',
};

function formatDungeonRecovery(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function createMainDungeonEntrySource(options: MainDungeonEntrySourceOptions) {
  let dungeonCatalog: S2C_DungeonCatalog | null = null;
  let requestedDungeonId: string | undefined;

  const renderDungeonUnavailablePanel = (dungeonId: string): void => {
    detailModalHost.patch({
      ownerId: DUNGEON_MODAL_OWNER,
      title: '副本不可用',
      subtitle: dungeonId ? `副本标识：${dungeonId}` : '未找到指定副本',
      variantClass: 'detail-modal--dungeon-entry',
      size: 'sm',
      bodyHtml: '<div class="empty-hint compact">当前副本目录已更新，请重新靠近对应忆梦石后再试。</div>',
    });
  };

  const renderDungeonLaunchPanel = (dungeonId: string): void => {
    const catalog = dungeonCatalog;
    const dungeon = catalog?.dungeons.find((entry) => entry.id === dungeonId);
    if (!catalog) {
      return;
    }
    if (!dungeon) {
      renderDungeonUnavailablePanel(dungeonId);
      return;
    }
    requestedDungeonId = dungeon.id;
    const bodyHtml = `<form data-dungeon-launch-form="true" class="dungeon-entry-launch"><div class="dungeon-entry-launch__controls"><label class="dungeon-entry-control"><span>难度</span><select name="difficulty" class="party-select">${Object.entries(DUNGEON_DIFFICULTY_LABELS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label class="dungeon-entry-control"><span>现世阶位</span><select name="presentRank" class="party-select">${DUNGEON_PRESENT_RANK_ORDER.map((rank) => `<option value="${rank}">${DUNGEON_RANK_LABELS[rank]}</option>`).join('')}</select></label></div><label class="dungeon-entry-simulation"><input type="checkbox" name="simulation" /><span><strong>模拟</strong><small>不消耗精力，无经验、掉落与任何收益</small></span></label><div class="dungeon-entry-stamina"><span class="dungeon-entry-stamina__label">消耗体力</span><strong data-dungeon-stamina-value></strong><span data-dungeon-stamina-recovery></span></div><div class="dungeon-entry-launch__hint">确认发起后，将邀请队友逐一确认；全员确认后才会扣除体力并进入副本。勾选模拟后不扣精力，也没有任何收益。</div><div class="dungeon-entry-launch__actions"><button type="submit" class="small-btn primary" data-dungeon-submit>确认发起并邀请队友确认</button></div></form>`;
    detailModalHost.patch({
      ownerId: DUNGEON_MODAL_OWNER,
      title: `副本·${dungeon.name}`,
      subtitle: '调整难度和阶位',
      variantClass: 'detail-modal--dungeon-entry',
      size: 'sm',
      bodyHtml,
      onAfterRender: (body, signal) => {
        const form = body.querySelector<HTMLFormElement>('[data-dungeon-launch-form="true"]');
        const difficulty = form?.elements.namedItem('difficulty') as HTMLSelectElement | null;
        const rank = form?.elements.namedItem('presentRank') as HTMLSelectElement | null;
        const simulation = form?.elements.namedItem('simulation') as HTMLInputElement | null;
        const staminaValue = body.querySelector<HTMLElement>('[data-dungeon-stamina-value]');
        const staminaRecovery = body.querySelector<HTMLElement>('[data-dungeon-stamina-recovery]');
        const staminaBox = body.querySelector<HTMLElement>('.dungeon-entry-stamina');
        const hint = body.querySelector<HTMLElement>('.dungeon-entry-launch__hint');
        const submit = body.querySelector<HTMLButtonElement>('[data-dungeon-submit]');
        if (!form || !difficulty || !rank || !simulation || !staminaValue || !staminaRecovery || !submit) return;
        const syncRank = (): void => {
          const maxRankStep = DUNGEON_PRESENT_RANK_ORDER.indexOf(dungeon.difficulty.maxPresentRank);
          Array.from(rank.options).forEach((option, index) => { option.disabled = index > maxRankStep; });
          if (rank.selectedIndex > maxRankStep && maxRankStep >= 0) rank.selectedIndex = maxRankStep;
          rank.disabled = difficulty.value !== 'present';
        };
        const syncStamina = (): void => {
          const stamina = resolveRecoveredStamina(catalog.stamina.current, catalog.stamina.updatedAt, Date.now(), catalog.stamina.maximum);
          const selectedDifficulty = difficulty.value as DungeonDifficulty;
          const simulated = simulation.checked;
          const cost = simulated ? 0 : resolveDungeonStaminaCost(selectedDifficulty, dungeon.difficulty);
          const afterCost = Math.max(0, stamina.current - cost);
          staminaValue.textContent = `${formatDisplayInteger(stamina.current)} → ${formatDisplayInteger(afterCost)} / ${formatDisplayInteger(catalog.stamina.maximum)}`;
          staminaValue.classList.toggle('is-insufficient', !simulated && stamina.current < cost);
          staminaBox?.classList.toggle('is-simulation', simulated);
          const recoveryRemain = stamina.nextRecoveryAt ? Math.max(0, stamina.nextRecoveryAt - Date.now()) : 0;
          staminaRecovery.textContent = simulated
            ? '模拟挑战不消耗精力'
            : stamina.current >= catalog.stamina.maximum ? '恢复倒计时：已满' : `恢复倒计时：${formatDungeonRecovery(recoveryRemain)} 后恢复 1 点`;
          if (hint) {
            hint.textContent = simulated
              ? '模拟挑战不消耗精力，通关与击杀均无经验、掉落与任何收益。'
              : '确认发起后，将邀请队友逐一确认；全员确认后才会扣除体力并进入副本。勾选模拟后不扣精力，也没有任何收益。';
          }
          submit.disabled = !simulated && stamina.current < cost;
          submit.textContent = !simulated && stamina.current < cost ? '体力不足' : '确认发起并邀请队友确认';
        };
        syncRank();
        syncStamina();
        difficulty.addEventListener('change', syncRank, { signal });
        difficulty.addEventListener('change', syncStamina, { signal });
        simulation.addEventListener('change', syncStamina, { signal });
        const timer = window.setInterval(syncStamina, 1000);
        signal.addEventListener('abort', () => window.clearInterval(timer), { once: true });
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const selectedDifficulty = difficulty.value as DungeonDifficulty;
          const presentRank = selectedDifficulty === 'present' ? (rank.value as TechniqueGrade) : undefined;
          options.socket.dungeon.startEntry({
            dungeonId: dungeon.id,
            difficulty: selectedDifficulty,
            ...(presentRank ? { presentRank } : {}),
            ...(simulation.checked ? { simulation: true } : {}),
          });
          detailModalHost.close(DUNGEON_MODAL_OWNER);
        }, { signal });
      },
    });
  };

  const renderDungeonEntryPanel = (): void => {
    const catalog = dungeonCatalog;
    if (!catalog) return;
    if (!requestedDungeonId) {
      renderDungeonUnavailablePanel('');
      return;
    }
    const selected = catalog.dungeons.find((entry) => entry.id === requestedDungeonId);
    if (selected) {
      renderDungeonLaunchPanel(selected.id);
    } else {
      renderDungeonUnavailablePanel(requestedDungeonId);
    }
  };

  options.socket.on(S2C.DungeonCatalog, (catalog) => {
    dungeonCatalog = catalog;
    if (detailModalHost.isOpenFor(DUNGEON_MODAL_OWNER)) renderDungeonEntryPanel();
  });

  const openDungeonPanel = (dungeonId: string): void => {
    const normalizedDungeonId = dungeonId.trim();
    if (!normalizedDungeonId) {
      options.showToast('当前忆梦石未绑定副本', 'warn');
      return;
    }
    requestedDungeonId = normalizedDungeonId;
    dungeonCatalog = null;
    detailModalHost.open({
      ownerId: DUNGEON_MODAL_OWNER,
      title: `副本·${normalizedDungeonId}`,
      subtitle: '正在读取副本信息……',
      size: 'sm',
      variantClass: 'detail-modal--dungeon-entry',
      bodyHtml: '<div class="empty-hint compact">正在读取副本信息……</div>',
    });
    options.socket.dungeon.requestCatalog();
  };

  return { openDungeonPanel };
}
