/**
 * 本文件是客户端藏经台弹层模块。UI 只负责选择与发送意图，录入合法性由服务端权威校验。
 */
import { getTechniqueMaxLevel, type PlayerState } from '@mud/shared';
import { getLocalRealmLevelEntry } from '../content/local-templates';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

const MODAL_OWNER = 'scripture-platform-modal';

type ScripturePlatformRecordingModalOptions = {
  buildingId: string;
  getPlayer: () => PlayerState | null;
  sendAction: (actionId: string) => void;
  showToast: (message: string, kind?: 'system' | 'warn' | 'success') => void;
};

type ScriptureTechniqueOption = PlayerState['techniques'][number] & {
  metaText: string;
};

export function openScripturePlatformRecordingModal(options: ScripturePlatformRecordingModalOptions): void {
  const buildingId = options.buildingId.trim();
  const player = options.getPlayer();
  if (!buildingId) {
    options.showToast('藏经台目标不存在。', 'warn');
    return;
  }
  if (!player) {
    options.showToast('角色状态尚未就绪。', 'warn');
    return;
  }
  const techniques = getRecordableTechniques(player);
  detailModalHost.open({
    ownerId: MODAL_OWNER,
    title: '藏经台录入',
    subtitle: '选择一门已圆满功法',
    variantClass: 'detail-modal--craft detail-modal--craft-transmission',
    size: 'md',
    bodyHtml: renderRecordingBody(techniques),
    onAfterRender: (body, signal) => bindRecordingEvents(body, signal, {
      buildingId,
      sendAction: options.sendAction,
    }),
  });
}

function getRecordableTechniques(player: PlayerState): ScriptureTechniqueOption[] {
  return [...(Array.isArray(player.techniques) ? player.techniques : [])]
    .filter((technique) => {
      const techId = normalizeText(technique.techId);
      if (!techId) {
        return false;
      }
      const level = Math.max(1, Math.trunc(Number(technique.level) || 1));
      const maxLevel = getTechniqueMaxLevel(Array.isArray(technique.layers) ? technique.layers : undefined, level);
      return level >= maxLevel || Number(technique.expToNext ?? 0) <= 0;
    })
    .map((technique) => ({
      ...technique,
      metaText: getTechniqueMetaText(technique),
    }))
    .sort((left, right) => {
      const realmDelta = Math.max(0, Number(right.realmLv) || 0) - Math.max(0, Number(left.realmLv) || 0);
      if (realmDelta !== 0) {
        return realmDelta;
      }
      return normalizeText(left.name).localeCompare(normalizeText(right.name), 'zh-Hans')
        || normalizeText(left.techId).localeCompare(normalizeText(right.techId), 'zh-Hans');
    });
}

function renderRecordingBody(techniques: ScriptureTechniqueOption[]): string {
  if (techniques.length === 0) {
    return `
      <div class="alchemy-tab-stack" data-scripture-record-panel="true">
        <section class="alchemy-summary-card">
          <div class="alchemy-summary-head">
            <div class="alchemy-summary-title">可录入功法</div>
            <span class="alchemy-summary-mode">0 门</span>
          </div>
          <div class="empty-hint">当前没有已圆满的功法</div>
        </section>
      </div>
    `;
  }
  const optionsHtml = techniques.map((technique) => {
    const name = normalizeText(technique.name) || normalizeText(technique.techId) || '功法';
    const search = `${name} ${technique.techId} ${technique.metaText}`.toLowerCase();
    return `<option value="${escapeHtmlAttr(technique.techId)}" data-search="${escapeHtmlAttr(search)}">${escapeHtml(name)} · ${escapeHtml(technique.metaText)}</option>`;
  }).join('');
  return `
    <div class="alchemy-tab-stack" data-scripture-record-panel="true">
      <section class="alchemy-summary-card">
        <div class="alchemy-summary-head">
          <div class="alchemy-summary-title">可录入功法</div>
          <span class="alchemy-summary-mode">${formatDisplayInteger(techniques.length)} 门</span>
        </div>
        <div class="transmission-teach-picker scripture-record-picker">
          <input class="ui-search-input" type="search" data-scripture-tech-search="true" placeholder="搜索已圆满功法">
          <select class="ui-input" data-scripture-tech-select="true">
            ${optionsHtml}
          </select>
          <button class="small-btn" type="button" data-scripture-record-start="true">开始录入</button>
        </div>
      </section>
    </div>
  `;
}

function bindRecordingEvents(
  body: HTMLElement,
  signal: AbortSignal,
  options: Pick<ScripturePlatformRecordingModalOptions, 'buildingId' | 'sendAction'>,
): void {
  body.addEventListener('input', (event) => {
    const input = event.target instanceof HTMLInputElement && event.target.matches('[data-scripture-tech-search="true"]')
      ? event.target
      : null;
    if (!input) return;
    filterTechniqueOptions(body, input.value);
  }, { signal });
  body.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.matches('[data-scripture-tech-select="true"]')) {
      syncStartButton(body);
    }
  }, { signal });
  body.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[data-scripture-record-start="true"]')
      : null;
    if (!button) return;
    const techId = normalizeText(body.querySelector<HTMLSelectElement>('[data-scripture-tech-select="true"]')?.value);
    if (!techId) return;
    options.sendAction(`scripture:record:${encodeURIComponent(options.buildingId)}:${encodeURIComponent(techId)}`);
    detailModalHost.close(MODAL_OWNER);
  }, { signal });
  syncStartButton(body);
}

function filterTechniqueOptions(body: HTMLElement, query: string): void {
  const select = body.querySelector<HTMLSelectElement>('[data-scripture-tech-select="true"]');
  if (!select) return;
  const normalizedQuery = query.trim().toLowerCase();
  let firstVisibleValue = '';
  for (const option of Array.from(select.options)) {
    const matches = !normalizedQuery || (option.dataset.search ?? option.textContent ?? '').toLowerCase().includes(normalizedQuery);
    option.hidden = !matches;
    if (matches && !firstVisibleValue) {
      firstVisibleValue = option.value;
    }
  }
  const selectedOption = select.selectedOptions[0] ?? null;
  if (!selectedOption || selectedOption.hidden) {
    select.value = firstVisibleValue;
  }
  select.disabled = !firstVisibleValue;
  syncStartButton(body);
}

function syncStartButton(body: HTMLElement): void {
  const techId = normalizeText(body.querySelector<HTMLSelectElement>('[data-scripture-tech-select="true"]')?.value);
  const button = body.querySelector<HTMLButtonElement>('[data-scripture-record-start="true"]');
  if (button) {
    button.disabled = !techId;
  }
}

function getTechniqueMetaText(technique: PlayerState['techniques'][number]): string {
  const gradeLabel = getTechniqueGradeLabel(technique.grade);
  const categoryLabel = getTechniqueCategoryLabel(technique.category);
  const level = Math.max(1, Math.floor(Number(technique.level) || 1));
  const maxLevel = getTechniqueMaxLevel(Array.isArray(technique.layers) ? technique.layers : undefined, level);
  const realmLv = Math.max(1, Math.floor(Number(technique.realmLv) || 1));
  const realmLabel = getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
  return `${gradeLabel} · ${categoryLabel} · ${realmLabel} · 第${formatDisplayInteger(level)}/${formatDisplayInteger(maxLevel)}层`;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}
