import {
  HEAVEN_GATE_REROLL_COST_RATIO,
  HEAVEN_GATE_SEVER_COST_RATIO,
  type ElementKey,
  type HeavenGateRootValues,
  type HeavenGateState,
  type PlayerState,
} from '@mud/shared';
import { detailModalHost } from './detail-modal-host';
import { patchElementHtml } from './dom-patch';
import { getElementKeyLabel } from '../domain-labels';
import { formatDisplayInteger } from '../utils/number';
import { describeSpiritualRoots, normalizeSpiritualRoots } from '../utils/spiritual-roots';

/** HEAVEN_GATE_OWNER：HEAVEN关卡OWNER。 */
const HEAVEN_GATE_OWNER = 'realm:heaven_gate';
/** HEAVEN_GATE_MIN_REALM_LEVEL：HEAVEN关卡最小境界等级。 */
const HEAVEN_GATE_MIN_REALM_LEVEL = 18;
const ELEMENTS: readonly ElementKey[] = ['metal', 'wood', 'water', 'fire', 'earth'];
/** HEAVEN_GATE_SEVER_COST_PERCENT：HEAVEN关卡SEVER COST PERCENT。 */
const HEAVEN_GATE_SEVER_COST_PERCENT = Math.round(HEAVEN_GATE_SEVER_COST_RATIO * 100);

/** PendingAction：天门弹层待确认操作。 */
type PendingAction =
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'sever' | 'restore';  
 /**
 * element：element相关字段。
 */
 element: ElementKey }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'open' | 'reroll' | 'enter' };

/** HeavenGateSession：天门弹层会话状态。 */
interface HeavenGateSession {
/**
 * realmName：realm名称名称或显示文本。
 */

  realmName: string;  
  /**
 * currentExp：currentExp相关字段。
 */

  currentExp: number;  
  /**
 * maxExp：maxExp相关字段。
 */

  maxExp: number;  
  /**
 * severed：severed相关字段。
 */

  severed: Set<ElementKey>;  
  /**
 * roots：根容器相关字段。
 */

  roots: HeavenGateRootValues | null;  
  /**
 * unlocked：unlocked相关字段。
 */

  unlocked: boolean;  
  /**
 * entered：entered相关字段。
 */

  entered: boolean;
}

/** 打开天门弹窗时注入的交互回调。 */
interface HeavenGateModalOptions {
/**
 * showToast：showToast相关字段。
 */

  showToast: (message: string, kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge') => void;  
  /**
 * sendAction：sendAction相关字段。
 */

  sendAction: (action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter', element?: ElementKey) => void;
}

interface HeavenGateEventContext {
  player: PlayerState;
  session: HeavenGateSession;
  options: HeavenGateModalOptions;
}

/** pendingAction：待处理动作。 */
let pendingAction: PendingAction | null = null;
/** cursorCleanup：用于恢复天门拖拽态光标的清理函数。 */
let cursorCleanup: (() => void) | null = null;
/** animationFrame：animation帧。 */
let animationFrame = 0;
/** animationToken：animation令牌。 */
let animationToken = 0;
/** lastAnimatedRootsKey：last Animated Roots Key。 */
let lastAnimatedRootsKey: string | null = null;
/** lastRenderedSessionKey：last Rendered会话Key。 */
let lastRenderedSessionKey: string | null = null;
let activeEventContext: HeavenGateEventContext | null = null;

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** cloneRoots：克隆Roots。 */
function cloneRoots(roots: HeavenGateRootValues | null | undefined): HeavenGateRootValues | null {
  return normalizeSpiritualRoots(roots);
}

/** getHeavenGateState：读取Heaven关卡状态。 */
function getHeavenGateState(player: PlayerState | null | undefined): HeavenGateState | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const realm = player?.realm;
  if (!realm || realm.realmLv < HEAVEN_GATE_MIN_REALM_LEVEL) {
    return null;
  }
  return realm.heavenGate ?? player?.heavenGate ?? null;
}

/** buildSession：构建会话。 */
function buildSession(player: PlayerState): HeavenGateSession | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const realm = player.realm;
  const heavenGate = getHeavenGateState(player);
  if (!realm || realm.realmLv < HEAVEN_GATE_MIN_REALM_LEVEL || !heavenGate?.unlocked) {
    return null;
  }
  if (heavenGate.entered === true) {
    return null;
  }
  return {
    realmName: realm.displayName,
    currentExp: Math.max(0, Math.floor(realm.progress ?? 0)),
    maxExp: Math.max(1, Math.floor(realm.progressToNext ?? 1)),
    severed: new Set<ElementKey>(heavenGate.severed ?? []),
    roots: cloneRoots(heavenGate.roots),
    unlocked: heavenGate.unlocked === true,
    entered: false,
  };
}

/** getSeverCost：读取Sever Cost。 */
function getSeverCost(session: HeavenGateSession): number {
  return Math.max(1, Math.round(session.maxExp * HEAVEN_GATE_SEVER_COST_RATIO));
}

/** getRerollCost：读取Reroll Cost。 */
function getRerollCost(session: HeavenGateSession): number {
  return Math.max(1, Math.round(session.maxExp * HEAVEN_GATE_REROLL_COST_RATIO));
}

/** createPlaceholderRoots：创建Placeholder Roots。 */
function createPlaceholderRoots(session: HeavenGateSession): HeavenGateRootValues {
  return ELEMENTS.reduce((result, element) => {
    result[element] = session.severed.has(element) ? 0 : 1;
    return result;
  }, {} as HeavenGateRootValues);
}

/** getRootsKey：读取Roots Key。 */
function getRootsKey(roots: HeavenGateRootValues | null): string | null {
  return roots ? JSON.stringify(roots) : null;
}

/** getSessionRenderKey：读取会话渲染Key。 */
function getSessionRenderKey(session: HeavenGateSession): string {
  return JSON.stringify({
    realmName: session.realmName,
    maxExp: session.maxExp,
    severed: ELEMENTS.filter((element) => session.severed.has(element)),
    roots: session.roots ? ELEMENTS.map((element) => session.roots?.[element] ?? 0) : null,
    unlocked: session.unlocked,
    entered: session.entered,
  });
}

/** describeRoots：处理describe Roots。 */
function describeRoots(roots: HeavenGateRootValues): {
/**
 * name：名称名称或显示文本。
 */
 name: string;
 /**
 * meta：meta相关字段。
 */
 meta: string;
 /**
 * desc：desc相关字段。
 */
 desc: string } {
  return describeSpiritualRoots(roots);
}

/** getLineValueStyle：读取Line值样式。 */
function getLineValueStyle(element: ElementKey): string {
  switch (element) {
    case 'metal':
      return 'left:50%;top:6.9%;';
    case 'wood':
      return 'left:73.8%;top:33.8%;';
    case 'water':
      return 'left:65.4%;top:85.4%;';
    case 'fire':
      return 'left:34.6%;top:85.4%;';
    default:
      return 'left:26.2%;top:33.8%;';
  }
}

/** renderBoard：渲染Board。 */
function renderBoard(session: HeavenGateSession): string {
  const displayRoots = session.roots ?? createPlaceholderRoots(session);
  return `
    <section class="heaven-gate-board" data-heaven-gate-board>
      <svg class="heaven-gate-lines" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
        <line class="heaven-gate-line ${session.severed.has('metal') ? 'hidden' : ''}" data-element="metal" x1="500" y1="280" x2="500" y2="112"></line>
        <line class="heaven-gate-line ${session.severed.has('metal') ? '' : 'hidden'}" data-element="metal" x1="500" y1="280" x2="494" y2="194"></line>
        <line class="heaven-gate-line ${session.severed.has('metal') ? '' : 'hidden'}" data-element="metal" x1="506" y1="166" x2="506" y2="138"></line>

        <line class="heaven-gate-line ${session.severed.has('wood') ? 'hidden' : ''}" data-element="wood" x1="500" y1="280" x2="660" y2="228"></line>
        <line class="heaven-gate-line ${session.severed.has('wood') ? '' : 'hidden'}" data-element="wood" x1="500" y1="280" x2="590" y2="257"></line>
        <line class="heaven-gate-line ${session.severed.has('wood') ? '' : 'hidden'}" data-element="wood" x1="603" y1="241" x2="637" y2="236"></line>

        <line class="heaven-gate-line ${session.severed.has('water') ? 'hidden' : ''}" data-element="water" x1="500" y1="280" x2="599" y2="416"></line>
        <line class="heaven-gate-line ${session.severed.has('water') ? '' : 'hidden'}" data-element="water" x1="500" y1="280" x2="549" y2="358"></line>
        <line class="heaven-gate-line ${session.severed.has('water') ? '' : 'hidden'}" data-element="water" x1="565" y1="365" x2="584" y2="396"></line>

        <line class="heaven-gate-line ${session.severed.has('fire') ? 'hidden' : ''}" data-element="fire" x1="500" y1="280" x2="401" y2="416"></line>
        <line class="heaven-gate-line ${session.severed.has('fire') ? '' : 'hidden'}" data-element="fire" x1="500" y1="280" x2="451" y2="358"></line>
        <line class="heaven-gate-line ${session.severed.has('fire') ? '' : 'hidden'}" data-element="fire" x1="435" y1="365" x2="416" y2="396"></line>

        <line class="heaven-gate-line ${session.severed.has('earth') ? 'hidden' : ''}" data-element="earth" x1="500" y1="280" x2="340" y2="228"></line>
        <line class="heaven-gate-line ${session.severed.has('earth') ? '' : 'hidden'}" data-element="earth" x1="500" y1="280" x2="410" y2="257"></line>
        <line class="heaven-gate-line ${session.severed.has('earth') ? '' : 'hidden'}" data-element="earth" x1="397" y1="241" x2="363" y2="236"></line>
      </svg>

      <div class="heaven-gate-path-layer">
        <button class="heaven-gate-path" data-heaven-gate-path="metal" data-heaven-gate-cursor-label="${session.severed.has('metal') ? '补' : '斩'}" type="button" style="left:50%;top:35%;width:18%;transform:translate(-50%, -50%) rotate(-90deg);" aria-label="${session.severed.has('metal') ? '补' : '斩'}金灵根"></button>
        <button class="heaven-gate-path" data-heaven-gate-path="wood" data-heaven-gate-cursor-label="${session.severed.has('wood') ? '补' : '斩'}" type="button" style="left:58%;top:45.4%;width:18%;transform:translate(-50%, -50%) rotate(-18deg);" aria-label="${session.severed.has('wood') ? '补' : '斩'}木灵根"></button>
        <button class="heaven-gate-path" data-heaven-gate-path="water" data-heaven-gate-cursor-label="${session.severed.has('water') ? '补' : '斩'}" type="button" style="left:54.95%;top:62.15%;width:18%;transform:translate(-50%, -50%) rotate(54deg);" aria-label="${session.severed.has('water') ? '补' : '斩'}水灵根"></button>
        <button class="heaven-gate-path" data-heaven-gate-path="fire" data-heaven-gate-cursor-label="${session.severed.has('fire') ? '补' : '斩'}" type="button" style="left:45.05%;top:62.15%;width:18%;transform:translate(-50%, -50%) rotate(126deg);" aria-label="${session.severed.has('fire') ? '补' : '斩'}火灵根"></button>
        <button class="heaven-gate-path" data-heaven-gate-path="earth" data-heaven-gate-cursor-label="${session.severed.has('earth') ? '补' : '斩'}" type="button" style="left:42%;top:45.4%;width:18%;transform:translate(-50%, -50%) rotate(198deg);" aria-label="${session.severed.has('earth') ? '补' : '斩'}土灵根"></button>
      </div>
      <div class="heaven-gate-cursor-text hidden" data-heaven-gate-cursor>斩</div>

      <div class="heaven-gate-node ${session.severed.has('metal') ? 'is-severed' : ''}" style="left:50%;top:13.5%;">
        <span class="heaven-gate-node-name" data-element="metal">金</span>
      </div>
      <div class="heaven-gate-line-value ${session.roots ? '' : 'hidden'} ${session.severed.has('metal') ? 'is-severed' : ''}" data-element="metal" data-heaven-gate-display-value="metal" data-target="${displayRoots.metal}" style="${getLineValueStyle('metal')}">${formatDisplayInteger(displayRoots.metal)}</div>

      <div class="heaven-gate-node ${session.severed.has('wood') ? 'is-severed' : ''}" style="left:69.8%;top:38%;">
        <span class="heaven-gate-node-name" data-element="wood">木</span>
      </div>
      <div class="heaven-gate-line-value ${session.roots ? '' : 'hidden'} ${session.severed.has('wood') ? 'is-severed' : ''}" data-element="wood" data-heaven-gate-display-value="wood" data-target="${displayRoots.wood}" style="${getLineValueStyle('wood')}">${formatDisplayInteger(displayRoots.wood)}</div>

      <div class="heaven-gate-node ${session.severed.has('water') ? 'is-severed' : ''}" style="left:62.4%;top:79.1%;">
        <span class="heaven-gate-node-name" data-element="water">水</span>
      </div>
      <div class="heaven-gate-line-value ${session.roots ? '' : 'hidden'} ${session.severed.has('water') ? 'is-severed' : ''}" data-element="water" data-heaven-gate-display-value="water" data-target="${displayRoots.water}" style="${getLineValueStyle('water')}">${formatDisplayInteger(displayRoots.water)}</div>

      <div class="heaven-gate-node ${session.severed.has('fire') ? 'is-severed' : ''}" style="left:37.6%;top:79.1%;">
        <span class="heaven-gate-node-name" data-element="fire">火</span>
      </div>
      <div class="heaven-gate-line-value ${session.roots ? '' : 'hidden'} ${session.severed.has('fire') ? 'is-severed' : ''}" data-element="fire" data-heaven-gate-display-value="fire" data-target="${displayRoots.fire}" style="${getLineValueStyle('fire')}">${formatDisplayInteger(displayRoots.fire)}</div>

      <div class="heaven-gate-node ${session.severed.has('earth') ? 'is-severed' : ''}" style="left:30.2%;top:38%;">
        <span class="heaven-gate-node-name" data-element="earth">土</span>
      </div>
      <div class="heaven-gate-line-value ${session.roots ? '' : 'hidden'} ${session.severed.has('earth') ? 'is-severed' : ''}" data-element="earth" data-heaven-gate-display-value="earth" data-target="${displayRoots.earth}" style="${getLineValueStyle('earth')}">${formatDisplayInteger(displayRoots.earth)}</div>

      <button class="heaven-gate-core" type="button" data-heaven-gate-core>
        <span class="heaven-gate-core-title">${session.roots ? '入天门' : '开天门'}</span>
      </button>
    </section>
  `;
}

/** renderBoardActions：渲染Board动作。 */
function renderBoardActions(session: HeavenGateSession): string {
  return `
    <div class="heaven-gate-board-actions ${session.roots ? '' : 'hidden'}">
      <button class="small-btn ghost" type="button" data-heaven-gate-reroll>逆天改命</button>
    </div>
  `;
}

/** renderPendingPopup：渲染待处理Popup。 */
function renderPendingPopup(session: HeavenGateSession): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!pendingAction) {
    return '';
  }
  if (pendingAction.kind === 'sever' || pendingAction.kind === 'restore') {
    const actionLabel = pendingAction.kind === 'sever' ? '斩断' : '补回';
    const cost = formatDisplayInteger(getSeverCost(session));
    const desc = pendingAction.kind === 'sever'
      ? `斩断后，此系将不参与本次随机；留数越少，单条越易高值，但该系本局将不再出现。消耗 ${cost} 点境界修为（上限 ${HEAVEN_GATE_SEVER_COST_PERCENT}%）；当前已有结果会失效并退回可重开。`
      : `补回会使该灵根重入随机池，并提高复合可能；补回同样消耗 ${cost} 点境界修为（上限 ${HEAVEN_GATE_SEVER_COST_PERCENT}%）；当前结果会失效并退回可重开。`;
    return `
      <div class="heaven-gate-popup-overlay" data-heaven-gate-popup-overlay>
        <section class="heaven-gate-popup" data-heaven-gate-popup>
          <div class="heaven-gate-popup-title">确认${actionLabel}${escapeHtml(getElementKeyLabel(pendingAction.element))}灵根</div>
          <div class="heaven-gate-popup-desc">${desc}</div>
          <div class="heaven-gate-popup-actions">
            <button class="small-btn ghost" type="button" data-heaven-gate-cancel>取消</button>
            <button class="small-btn" type="button" data-heaven-gate-confirm>确认${actionLabel}</button>
          </div>
        </section>
      </div>
    `;
  }
  if (pendingAction.kind === 'open') {
    return `
      <div class="heaven-gate-popup-overlay" data-heaven-gate-popup-overlay>
        <section class="heaven-gate-popup" data-heaven-gate-popup>
          <div class="heaven-gate-popup-title">确认开天门</div>
          <div class="heaven-gate-popup-desc">开天门不耗境界修为。多灵根则更易出现，斩后更偏单一高值；被斩属性本局不再出现。对结果不满可入天门前逆天改命重开。</div>
          <div class="heaven-gate-popup-actions">
            <button class="small-btn ghost" type="button" data-heaven-gate-cancel>取消</button>
            <button class="small-btn" type="button" data-heaven-gate-confirm>确认开天门</button>
          </div>
        </section>
      </div>
    `;
  }
  if (pendingAction.kind === 'reroll') {
    return `
      <div class="heaven-gate-popup-overlay" data-heaven-gate-popup-overlay>
        <section class="heaven-gate-popup" data-heaven-gate-popup>
          <div class="heaven-gate-popup-title">确认逆天改命</div>
          <div class="heaven-gate-popup-desc">逆天改命会消耗 ${formatDisplayInteger(getRerollCost(session))} 点境界修为，并清掉当前结果，退回重新开天门状态。</div>
          <div class="heaven-gate-popup-actions">
            <button class="small-btn ghost" type="button" data-heaven-gate-cancel>取消</button>
            <button class="small-btn" type="button" data-heaven-gate-confirm>确认逆天改命</button>
          </div>
        </section>
      </div>
    `;
  }
  return `
    <div class="heaven-gate-popup-overlay" data-heaven-gate-popup-overlay>
      <section class="heaven-gate-popup" data-heaven-gate-popup>
        <div class="heaven-gate-popup-title">确认入天门</div>
        <div class="heaven-gate-popup-desc">入天门会正式写入本次灵根并完成开天门，但不会代替突破动作。入天门后，多数情况下结果即定，难以再重抽或逆天改命。</div>
        <div class="heaven-gate-popup-actions">
          <button class="small-btn ghost" type="button" data-heaven-gate-cancel>取消</button>
          <button class="small-btn" type="button" data-heaven-gate-confirm>确认入天门</button>
        </div>
      </section>
    </div>
  `;
}

/** stopValueAnimation：停止值Animation。 */
function stopValueAnimation(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    /** animationFrame：animation帧。 */
    animationFrame = 0;
  }
  animationToken += 1;
}

/** animateValues：处理animate值。 */
function animateValues(body: HTMLElement, session: HeavenGateSession, rootsKey: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!session.roots) {
    return;
  }
  stopValueAnimation();
  const token = animationToken;
  const targets = ELEMENTS.reduce((result, element) => {
    result[element] = session.roots?.[element] ?? 0;
    return result;
  }, {} as HeavenGateRootValues);
  const starts = createPlaceholderRoots(session);
  const nodes = new Map<ElementKey, HTMLElement>();
  body.querySelectorAll<HTMLElement>('[data-heaven-gate-display-value]').forEach((node) => {
    const element = node.dataset.heavenGateDisplayValue as ElementKey | undefined;
    if (element) {
      nodes.set(element, node);
    }
  });
  const startedAt = performance.now();
  const duration = 1080;
  /** tick：推进Tick。 */
  const tick = (now: number) => {
    if (token !== animationToken) {
      return;
    }
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress);
    for (const element of ELEMENTS) {
      const node = nodes.get(element);
      if (!node) {
        continue;
      }
      const next = progress >= 1
        ? targets[element]
        : Math.max(0, Math.floor(starts[element] + (targets[element] - starts[element]) * eased));
      node.textContent = formatDisplayInteger(next);
    }
    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
      return;
    }
    /** animationFrame：animation帧。 */
    animationFrame = 0;
    /** lastAnimatedRootsKey：last Animated Roots Key。 */
    lastAnimatedRootsKey = rootsKey;
  };
  /** animationFrame：animation帧。 */
  animationFrame = requestAnimationFrame(tick);
}

/** bindCursor：绑定Cursor。 */
function bindCursor(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const board = body.querySelector<HTMLElement>('[data-heaven-gate-board]');
  const cursor = body.querySelector<HTMLElement>('[data-heaven-gate-cursor]');
  if (!board || !cursor) {
    return;
  }
  /** syncCursor：同步Cursor。 */
  const syncCursor = (event: MouseEvent, label: string) => {
    const rect = board.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const x = ((event.clientX - rect.left) / width) * board.offsetWidth;
    const y = ((event.clientY - rect.top) / height) * board.offsetHeight;
    cursor.classList.remove('hidden');
    cursor.textContent = label;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    document.body.classList.add('heaven-gate-brush-cursor');
  };
  /** hideCursor：处理hide Cursor。 */
  const hideCursor = () => {
    cursor.classList.add('hidden');
    document.body.classList.remove('heaven-gate-brush-cursor');
  };
  body.querySelectorAll<HTMLButtonElement>('[data-heaven-gate-path]').forEach((button) => {
    const label = button.dataset.heavenGateCursorLabel ?? '斩';
    button.addEventListener('mouseenter', (event) => syncCursor(event as MouseEvent, label));
    button.addEventListener('mousemove', (event) => syncCursor(event, label));
    button.addEventListener('mouseleave', hideCursor);
  });
  /** cursorCleanup：cursor Cleanup。 */
  cursorCleanup = hideCursor;
}

/** clearPendingAction：清理待处理动作。 */
function clearPendingAction(): void {
  /** pendingAction：待处理动作。 */
  pendingAction = null;
}

/** renderHeavenGateModal：渲染Heaven关卡弹窗。 */
function renderHeavenGateModal(player: PlayerState, session: HeavenGateSession, options: HeavenGateModalOptions): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  cursorCleanup?.();
  /** cursorCleanup：cursor Cleanup。 */
  cursorCleanup = null;
  stopValueAnimation();
  const rootsKey = getRootsKey(session.roots);
  const shouldAnimate = Boolean(rootsKey && rootsKey !== lastAnimatedRootsKey);
  const judgement = session.roots ? describeRoots(session.roots) : null;
  /** lastRenderedSessionKey：last Rendered会话Key。 */
  lastRenderedSessionKey = getSessionRenderKey(session);
  const existingBody = detailModalHost.isOpenFor(HEAVEN_GATE_OWNER)
    ? document.getElementById('detail-modal-body')
    : null;
  if (existingBody && patchHeavenGateModalBody(existingBody, session, judgement)) {
    const title = document.getElementById('detail-modal-title');
    const subtitle = document.getElementById('detail-modal-subtitle');
    const hint = document.getElementById('detail-modal-hint');
    if (title) {
      title.textContent = '开天门';
    }
    if (subtitle) {
      subtitle.textContent = `${player.realm?.displayName ?? '开天门'}`;
    }
    if (hint) {
      hint.textContent = '点击空白处关闭';
    }
    bindHeavenGateEvents(existingBody, player, session, options, shouldAnimate, rootsKey);
    return;
  }

  detailModalHost.open({
    ownerId: HEAVEN_GATE_OWNER,
    size: 'md',
    variantClass: 'detail-modal--heaven-gate',
    title: '开天门',
    subtitle: `${player.realm?.displayName ?? '开天门'}`,
    hint: '点击空白处关闭',
    renderBody: (body) => {
      patchElementHtml(body, renderHeavenGateShell(session, judgement));
    },
    onClose: () => {
      clearPendingAction();
      activeEventContext = null;
      cursorCleanup?.();
      cursorCleanup = null;
      stopValueAnimation();
      lastAnimatedRootsKey = null;
      lastRenderedSessionKey = null;
      document.body.classList.remove('heaven-gate-brush-cursor');
    },
    onAfterRender: (body, signal) => {
      bindHeavenGateEvents(body, player, session, options, shouldAnimate, rootsKey, signal);
    },
  });
}
/**
 * renderHeavenGateShell：执行HeavenGateShell相关逻辑。
 * @param session HeavenGateSession 参数说明。
 * @param judgement { name: string; meta: string; desc: string } | null 参数说明。
 * @returns 返回HeavenGateShell。
 */


function renderHeavenGateShell(
  session: HeavenGateSession,
  judgement: {  
  /**
 * name：名称名称或显示文本。
 */
 name: string;  
 /**
 * meta：meta相关字段。
 */
 meta: string;  
 /**
 * desc：desc相关字段。
 */
 desc: string } | null,
): string {
  return `
    <div class="heaven-gate-shell">
      <section class="heaven-gate-judgement ${session.roots ? '' : 'hidden'}" data-heaven-gate-judgement="true">
        <div class="heaven-gate-judgement-name">${escapeHtml(judgement?.name ?? '')}</div>
        <div class="heaven-gate-judgement-meta">${escapeHtml(judgement?.meta ?? '')}</div>
        <div class="heaven-gate-judgement-desc">${escapeHtml(judgement?.desc ?? '')}</div>
      </section>
      <div data-heaven-gate-board-shell="true">${renderBoard(session)}</div>
      <div data-heaven-gate-actions-shell="true">${renderBoardActions(session)}</div>
      <div data-heaven-gate-popup-shell="true">${renderPendingPopup(session)}</div>
    </div>
  `;
}
/**
 * patchHeavenGateModalBody：执行patchHeavenGate弹层Body相关逻辑。
 * @param body HTMLElement 参数说明。
 * @param session HeavenGateSession 参数说明。
 * @param judgement { name: string; meta: string; desc: string } | null 参数说明。
 * @returns 返回是否满足patchHeavenGate弹层Body条件。
 */


function patchHeavenGateModalBody(
  body: HTMLElement,
  session: HeavenGateSession,
  judgement: {  
  /**
 * name：名称名称或显示文本。
 */
 name: string;  
 /**
 * meta：meta相关字段。
 */
 meta: string;  
 /**
 * desc：desc相关字段。
 */
 desc: string } | null,
): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const shell = body.querySelector<HTMLElement>('.heaven-gate-shell');
  const judgementSection = body.querySelector<HTMLElement>('[data-heaven-gate-judgement="true"]');
  const boardShell = body.querySelector<HTMLElement>('[data-heaven-gate-board-shell="true"]');
  const actionsShell = body.querySelector<HTMLElement>('[data-heaven-gate-actions-shell="true"]');
  const popupShell = body.querySelector<HTMLElement>('[data-heaven-gate-popup-shell="true"]');
  if (!shell || !judgementSection || !boardShell || !actionsShell || !popupShell) {
    return false;
  }
  judgementSection.classList.toggle('hidden', !session.roots);
  setInnerHtml(judgementSection.querySelector('.heaven-gate-judgement-name'), escapeHtml(judgement?.name ?? ''));
  setInnerHtml(judgementSection.querySelector('.heaven-gate-judgement-meta'), escapeHtml(judgement?.meta ?? ''));
  setInnerHtml(judgementSection.querySelector('.heaven-gate-judgement-desc'), escapeHtml(judgement?.desc ?? ''));
  patchElementHtml(boardShell, renderBoard(session));
  patchElementHtml(actionsShell, renderBoardActions(session));
  patchElementHtml(popupShell, renderPendingPopup(session));
  return true;
}
/**
 * bindHeavenGateEvents：执行bindHeavenGate事件相关逻辑。
 * @param body HTMLElement 参数说明。
 * @param player PlayerState 玩家对象。
 * @param session HeavenGateSession 参数说明。
 * @param options HeavenGateModalOptions 选项参数。
 * @param shouldAnimate boolean 参数说明。
 * @param rootsKey string | null 参数说明。
 * @returns 无返回值，直接更新bindHeavenGate事件相关状态。
 */


function bindHeavenGateEvents(
  body: HTMLElement,
  player: PlayerState,
  session: HeavenGateSession,
  options: HeavenGateModalOptions,
  shouldAnimate: boolean,
  rootsKey: string | null,
  signal?: AbortSignal,
): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  bindCursor(body);
  activeEventContext = { player, session, options };
  if (signal) {
    body.addEventListener('click', (event) => {
      const context = activeEventContext;
      if (!context || !detailModalHost.isOpenFor(HEAVEN_GATE_OWNER)) {
        return;
      }
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[data-heaven-gate-path],[data-heaven-gate-core],[data-heaven-gate-reroll],[data-heaven-gate-cancel],[data-heaven-gate-confirm],[data-heaven-gate-popup-overlay],[data-heaven-gate-popup]')
        : null;
      if (!target) {
        return;
      }
      event.stopPropagation();
      if (target.hasAttribute('data-heaven-gate-popup')) {
        return;
      }
      if (target.hasAttribute('data-heaven-gate-popup-overlay')) {
        if (event.target !== target) {
          return;
        }
        clearPendingAction();
        renderHeavenGateModal(context.player, context.session, context.options);
        return;
      }
      if (target.hasAttribute('data-heaven-gate-cancel')) {
        clearPendingAction();
        renderHeavenGateModal(context.player, context.session, context.options);
        return;
      }
      if (target.hasAttribute('data-heaven-gate-confirm')) {
        if (!pendingAction) {
          return;
        }
        const action = pendingAction;
        clearPendingAction();
        context.options.sendAction(action.kind === 'restore' ? 'restore' : action.kind, 'element' in action ? action.element : undefined);
        return;
      }
      if (target.hasAttribute('data-heaven-gate-reroll')) {
        pendingAction = { kind: 'reroll' };
        renderHeavenGateModal(context.player, context.session, context.options);
        return;
      }
      if (target.hasAttribute('data-heaven-gate-core')) {
        pendingAction = context.session.roots ? { kind: 'enter' } : { kind: 'open' };
        renderHeavenGateModal(context.player, context.session, context.options);
        return;
      }
      const element = target.dataset.heavenGatePath as ElementKey | undefined;
      if (!element) {
        return;
      }
      if (!context.session.severed.has(element) && context.session.severed.size >= 4) {
        context.options.showToast('最多只能斩断四条灵根。');
        return;
      }
      pendingAction = context.session.severed.has(element)
        ? { kind: 'restore', element }
        : { kind: 'sever', element };
      renderHeavenGateModal(context.player, context.session, context.options);
    }, { signal });
  }
  if (shouldAnimate && rootsKey) {
    animateValues(body, session, rootsKey);
  } else if (!rootsKey) {
    lastAnimatedRootsKey = null;
  }
}
/**
 * setInnerHtml：写入InnerHtml。
 * @param node Element | null 参数说明。
 * @param value string 参数说明。
 * @returns 无返回值，直接更新InnerHtml相关状态。
 */


function setInnerHtml(node: Element | null, value: string): void {
  if (node instanceof HTMLElement) {
    patchElementHtml(node, value);
  }
}

/** refreshHeavenGateModal：处理refresh Heaven关卡弹窗。 */
export function refreshHeavenGateModal(player: PlayerState | null | undefined, options: HeavenGateModalOptions): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!detailModalHost.isOpenFor(HEAVEN_GATE_OWNER)) {
    return;
  }
  if (!player) {
    detailModalHost.close(HEAVEN_GATE_OWNER);
    return;
  }
  const session = buildSession(player);
  if (!session) {
    detailModalHost.close(HEAVEN_GATE_OWNER);
    return;
  }
  const nextSessionKey = getSessionRenderKey(session);
  if (nextSessionKey === lastRenderedSessionKey) {
    return;
  }
  renderHeavenGateModal(player, session, options);
}

/** getHeavenGateHudAction：读取Heaven关卡HUD动作。 */
export function getHeavenGateHudAction(player: PlayerState | null | undefined): {
/**
 * visible：可见相关字段。
 */
 visible: boolean;
 /**
 * label：label名称或显示文本。
 */
 label: string } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const session = player ? buildSession(player) : null;
  if (!session?.unlocked) {
    return null;
  }
  return {
    visible: true,
    label: '开天门',
  };
}

/** openHeavenGateModal：打开Heaven关卡弹窗。 */
export function openHeavenGateModal(player: PlayerState | null | undefined, options: HeavenGateModalOptions): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!player) {
    options.showToast('当前未获取到角色状态。');
    return false;
  }
  const session = buildSession(player);
  if (!session) {
    options.showToast('当前已完成入天门，或暂时不处于可开天门状态。');
    return false;
  }
  renderHeavenGateModal(player, session, options);
  return true;
}
