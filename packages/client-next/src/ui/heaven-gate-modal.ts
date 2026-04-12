import {
  HEAVEN_GATE_REROLL_COST_RATIO,
  HEAVEN_GATE_SEVER_COST_RATIO,
  type ElementKey,
  type HeavenGateRootValues,
  type HeavenGateState,
  type PlayerState,
} from '@mud/shared-next';
import { detailModalHost } from './detail-modal-host';
import { getElementKeyLabel } from '../domain-labels';
import { formatDisplayInteger } from '../utils/number';
import { clientToViewportPoint } from './responsive-viewport';
import { describeSpiritualRoots, normalizeSpiritualRoots } from '../utils/spiritual-roots';

/** HEAVEN_GATE_OWNER：定义该变量以承载业务值。 */
const HEAVEN_GATE_OWNER = 'realm:heaven_gate';
/** HEAVEN_GATE_MIN_REALM_LEVEL：定义该变量以承载业务值。 */
const HEAVEN_GATE_MIN_REALM_LEVEL = 18;
/** ELEMENTS：定义该变量以承载业务值。 */
const ELEMENTS: readonly ElementKey[] = ['metal', 'wood', 'water', 'fire', 'earth'];
/** HEAVEN_GATE_SEVER_COST_PERCENT：定义该变量以承载业务值。 */
const HEAVEN_GATE_SEVER_COST_PERCENT = Math.round(HEAVEN_GATE_SEVER_COST_RATIO * 100);

/** PendingAction：定义该类型的结构与数据语义。 */
type PendingAction =
  | { kind: 'sever' | 'restore'; element: ElementKey }
  | { kind: 'open' | 'reroll' | 'enter' };

/** HeavenGateSession：定义该接口的能力与字段约束。 */
interface HeavenGateSession {
/** realmName：定义该变量以承载业务值。 */
  realmName: string;
/** currentExp：定义该变量以承载业务值。 */
  currentExp: number;
/** maxExp：定义该变量以承载业务值。 */
  maxExp: number;
/** severed：定义该变量以承载业务值。 */
  severed: Set<ElementKey>;
/** roots：定义该变量以承载业务值。 */
  roots: HeavenGateRootValues | null;
/** unlocked：定义该变量以承载业务值。 */
  unlocked: boolean;
/** entered：定义该变量以承载业务值。 */
  entered: boolean;
}

/** HeavenGateModalOptions：定义该接口的能力与字段约束。 */
interface HeavenGateModalOptions {
  showToast: (message: string, kind?: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge') => void;
  sendAction: (action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter', element?: ElementKey) => void;
}

/** pendingAction：定义该变量以承载业务值。 */
let pendingAction: PendingAction | null = null;
/** cursorCleanup：定义该变量以承载业务值。 */
let cursorCleanup: (() => void) | null = null;
/** animationFrame：定义该变量以承载业务值。 */
let animationFrame = 0;
/** animationToken：定义该变量以承载业务值。 */
let animationToken = 0;
/** lastAnimatedRootsKey：定义该变量以承载业务值。 */
let lastAnimatedRootsKey: string | null = null;
/** lastRenderedSessionKey：定义该变量以承载业务值。 */
let lastRenderedSessionKey: string | null = null;

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** cloneRoots：执行对应的业务逻辑。 */
function cloneRoots(roots: HeavenGateRootValues | null | undefined): HeavenGateRootValues | null {
  return normalizeSpiritualRoots(roots);
}

/** getHeavenGateState：执行对应的业务逻辑。 */
function getHeavenGateState(player: PlayerState | null | undefined): HeavenGateState | null {
/** realm：定义该变量以承载业务值。 */
  const realm = player?.realm;
  if (!realm || realm.realmLv < HEAVEN_GATE_MIN_REALM_LEVEL) {
    return null;
  }
  return realm.heavenGate ?? player?.heavenGate ?? null;
}

/** buildSession：执行对应的业务逻辑。 */
function buildSession(player: PlayerState): HeavenGateSession | null {
/** realm：定义该变量以承载业务值。 */
  const realm = player.realm;
/** heavenGate：定义该变量以承载业务值。 */
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
/** unlocked：定义该变量以承载业务值。 */
    unlocked: heavenGate.unlocked === true,
    entered: false,
  };
}

/** getSeverCost：执行对应的业务逻辑。 */
function getSeverCost(session: HeavenGateSession): number {
  return Math.max(1, Math.round(session.maxExp * HEAVEN_GATE_SEVER_COST_RATIO));
}

/** getRerollCost：执行对应的业务逻辑。 */
function getRerollCost(session: HeavenGateSession): number {
  return Math.max(1, Math.round(session.maxExp * HEAVEN_GATE_REROLL_COST_RATIO));
}

/** createPlaceholderRoots：执行对应的业务逻辑。 */
function createPlaceholderRoots(session: HeavenGateSession): HeavenGateRootValues {
  return ELEMENTS.reduce((result, element) => {
    result[element] = session.severed.has(element) ? 0 : 1;
    return result;
  }, {} as HeavenGateRootValues);
}

/** getRootsKey：执行对应的业务逻辑。 */
function getRootsKey(roots: HeavenGateRootValues | null): string | null {
  return roots ? JSON.stringify(roots) : null;
}

/** getSessionRenderKey：执行对应的业务逻辑。 */
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

/** describeRoots：执行对应的业务逻辑。 */
function describeRoots(roots: HeavenGateRootValues): { name: string; meta: string; desc: string } {
  return describeSpiritualRoots(roots);
}

/** getLineValueStyle：执行对应的业务逻辑。 */
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

/** renderBoard：执行对应的业务逻辑。 */
function renderBoard(session: HeavenGateSession): string {
/** displayRoots：定义该变量以承载业务值。 */
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

/** renderBoardActions：执行对应的业务逻辑。 */
function renderBoardActions(session: HeavenGateSession): string {
  return `
    <div class="heaven-gate-board-actions ${session.roots ? '' : 'hidden'}">
      <button class="small-btn ghost" type="button" data-heaven-gate-reroll>逆天改命</button>
    </div>
  `;
}

/** renderPendingPopup：执行对应的业务逻辑。 */
function renderPendingPopup(session: HeavenGateSession): string {
  if (!pendingAction) {
    return '';
  }
  if (pendingAction.kind === 'sever' || pendingAction.kind === 'restore') {
/** actionLabel：定义该变量以承载业务值。 */
    const actionLabel = pendingAction.kind === 'sever' ? '斩断' : '补回';
/** cost：定义该变量以承载业务值。 */
    const cost = formatDisplayInteger(getSeverCost(session));
/** desc：定义该变量以承载业务值。 */
    const desc = pendingAction.kind === 'sever'
      ? `斩断后，这一系灵根本次将完全不参与随机分配；保留的灵根越少，单条数值通常越容易更高，但你也等于主动放弃了这一系出现在最终结果里的可能。若不斩，则这一系仍会和其他灵根一起分摊总值，更容易形成多灵根结果。此次会消耗 ${cost} 点境界修为（当前境界修为上限的 ${HEAVEN_GATE_SEVER_COST_PERCENT}%）；若想补回，补灵根同样需要 ${cost} 点境界修为。若当前已有开天门结果，结果会立刻失效并退回重新开门。`
      : `补回后，这一系灵根会重新进入本次开天门随机池。补回意味着最终更可能出现多灵根、总值分配更分散；不补则会继续提高剩余灵根吃到高数值的机会。补灵根会消耗 ${cost} 点境界修为（当前境界修为上限的 ${HEAVEN_GATE_SEVER_COST_PERCENT}%）；若当前已有开天门结果，结果同样会立刻失效并退回重新开门。`;
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
          <div class="heaven-gate-popup-desc">开天门本身不消耗境界修为。若你不斩灵根，五行都会参与本次随机，更容易形成多灵根，整体总值上限更高，但平均到单条上的数值通常更低；若先斩去部分灵根，剩余越少，单条越容易抽到高值，但被斩掉的属性本次就不可能再出现。若对结果不满，入天门前仍可消耗境界修为逆天改命，再重新开天门。</div>
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
        <div class="heaven-gate-popup-desc">入天门不会让你立刻突破到练气，它只会正式写入当前灵根，并完成“开天门”这一步。完成后，后续仍需按原本的练气突破条件正常突破。请特别注意：一旦入天门，绝大多数情况下都不能再重新开天门、重抽灵根或逆天改命，这次结果基本就定下来了。</div>
        <div class="heaven-gate-popup-actions">
          <button class="small-btn ghost" type="button" data-heaven-gate-cancel>取消</button>
          <button class="small-btn" type="button" data-heaven-gate-confirm>确认入天门</button>
        </div>
      </section>
    </div>
  `;
}

/** stopValueAnimation：执行对应的业务逻辑。 */
function stopValueAnimation(): void {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  animationToken += 1;
}

/** animateValues：执行对应的业务逻辑。 */
function animateValues(body: HTMLElement, session: HeavenGateSession, rootsKey: string): void {
  if (!session.roots) {
    return;
  }
  stopValueAnimation();
/** token：定义该变量以承载业务值。 */
  const token = animationToken;
/** targets：定义该变量以承载业务值。 */
  const targets = ELEMENTS.reduce((result, element) => {
    result[element] = session.roots?.[element] ?? 0;
    return result;
  }, {} as HeavenGateRootValues);
/** starts：定义该变量以承载业务值。 */
  const starts = createPlaceholderRoots(session);
/** nodes：定义该变量以承载业务值。 */
  const nodes = new Map<ElementKey, HTMLElement>();
  body.querySelectorAll<HTMLElement>('[data-heaven-gate-display-value]').forEach((node) => {
/** element：定义该变量以承载业务值。 */
    const element = node.dataset.heavenGateDisplayValue as ElementKey | undefined;
    if (element) {
      nodes.set(element, node);
    }
  });
/** startedAt：定义该变量以承载业务值。 */
  const startedAt = performance.now();
/** duration：定义该变量以承载业务值。 */
  const duration = 1080;
/** tick：通过常量导出可复用函数行为。 */
  const tick = (now: number) => {
    if (token !== animationToken) {
      return;
    }
/** progress：定义该变量以承载业务值。 */
    const progress = Math.min(1, (now - startedAt) / duration);
/** eased：定义该变量以承载业务值。 */
    const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress);
    for (const element of ELEMENTS) {
      const node = nodes.get(element);
      if (!node) {
        continue;
      }
/** next：定义该变量以承载业务值。 */
      const next = progress >= 1
        ? targets[element]
        : Math.max(0, Math.floor(starts[element] + (targets[element] - starts[element]) * eased));
      node.textContent = formatDisplayInteger(next);
    }
    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
      return;
    }
    animationFrame = 0;
    lastAnimatedRootsKey = rootsKey;
  };
  animationFrame = requestAnimationFrame(tick);
}

/** bindCursor：执行对应的业务逻辑。 */
function bindCursor(body: HTMLElement): void {
/** board：定义该变量以承载业务值。 */
  const board = body.querySelector<HTMLElement>('[data-heaven-gate-board]');
/** cursor：定义该变量以承载业务值。 */
  const cursor = body.querySelector<HTMLElement>('[data-heaven-gate-cursor]');
  if (!board || !cursor) {
    return;
  }
/** syncCursor：通过常量导出可复用函数行为。 */
  const syncCursor = (event: MouseEvent, label: string) => {
/** point：定义该变量以承载业务值。 */
    const point = clientToViewportPoint(window, event.clientX, event.clientY);
    cursor.classList.remove('hidden');
    cursor.textContent = label;
    cursor.style.left = `${point.x}px`;
    cursor.style.top = `${point.y}px`;
    document.body.classList.add('heaven-gate-brush-cursor');
  };
/** hideCursor：通过常量导出可复用函数行为。 */
  const hideCursor = () => {
    cursor.classList.add('hidden');
    document.body.classList.remove('heaven-gate-brush-cursor');
  };
  body.querySelectorAll<HTMLButtonElement>('[data-heaven-gate-path]').forEach((button) => {
/** label：定义该变量以承载业务值。 */
    const label = button.dataset.heavenGateCursorLabel ?? '斩';
    button.addEventListener('mouseenter', (event) => syncCursor(event as MouseEvent, label));
    button.addEventListener('mousemove', (event) => syncCursor(event, label));
    button.addEventListener('mouseleave', hideCursor);
  });
  cursorCleanup = hideCursor;
}

/** clearPendingAction：执行对应的业务逻辑。 */
function clearPendingAction(): void {
  pendingAction = null;
}

/** renderHeavenGateModal：执行对应的业务逻辑。 */
function renderHeavenGateModal(player: PlayerState, session: HeavenGateSession, options: HeavenGateModalOptions): void {
  cursorCleanup?.();
  cursorCleanup = null;
  stopValueAnimation();
/** rootsKey：定义该变量以承载业务值。 */
  const rootsKey = getRootsKey(session.roots);
/** shouldAnimate：定义该变量以承载业务值。 */
  const shouldAnimate = Boolean(rootsKey && rootsKey !== lastAnimatedRootsKey);
/** judgement：定义该变量以承载业务值。 */
  const judgement = session.roots ? describeRoots(session.roots) : null;
  lastRenderedSessionKey = getSessionRenderKey(session);

  detailModalHost.open({
    ownerId: HEAVEN_GATE_OWNER,
    variantClass: 'detail-modal--heaven-gate',
    title: '开天门',
    subtitle: `${player.realm?.displayName ?? '开天门'}`,
    hint: '点击空白处关闭',
    bodyHtml: `
      <div class="heaven-gate-shell">
        <section class="heaven-gate-judgement ${session.roots ? '' : 'hidden'}">
          <div class="heaven-gate-judgement-name">${escapeHtml(judgement?.name ?? '')}</div>
          <div class="heaven-gate-judgement-meta">${escapeHtml(judgement?.meta ?? '')}</div>
          <div class="heaven-gate-judgement-desc">${escapeHtml(judgement?.desc ?? '')}</div>
        </section>
        ${renderBoard(session)}
        ${renderBoardActions(session)}
        ${renderPendingPopup(session)}
      </div>
    `,
    onClose: () => {
      clearPendingAction();
      cursorCleanup?.();
      cursorCleanup = null;
      stopValueAnimation();
      lastAnimatedRootsKey = null;
      lastRenderedSessionKey = null;
      document.body.classList.remove('heaven-gate-brush-cursor');
    },
    onAfterRender: (body) => {
      bindCursor(body);
      body.querySelectorAll<HTMLButtonElement>('[data-heaven-gate-path]').forEach((button) => {
/** element：定义该变量以承载业务值。 */
        const element = button.dataset.heavenGatePath as ElementKey | undefined;
        if (!element) {
          return;
        }
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!session.severed.has(element) && session.severed.size >= 4) {
            options.showToast('最多只能斩断四条灵根。');
            return;
          }
          pendingAction = session.severed.has(element)
            ? { kind: 'restore', element }
            : { kind: 'sever', element };
          renderHeavenGateModal(player, session, options);
        });
      });
      body.querySelector<HTMLButtonElement>('[data-heaven-gate-core]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        pendingAction = session.roots ? { kind: 'enter' } : { kind: 'open' };
        renderHeavenGateModal(player, session, options);
      });
      body.querySelector<HTMLButtonElement>('[data-heaven-gate-reroll]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        pendingAction = { kind: 'reroll' };
        renderHeavenGateModal(player, session, options);
      });
      body.querySelector<HTMLElement>('[data-heaven-gate-popup]')?.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      body.querySelector<HTMLElement>('[data-heaven-gate-popup-overlay]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.target !== event.currentTarget) {
          return;
        }
        clearPendingAction();
        renderHeavenGateModal(player, session, options);
      });
      body.querySelector<HTMLButtonElement>('[data-heaven-gate-cancel]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        clearPendingAction();
        renderHeavenGateModal(player, session, options);
      });
      body.querySelector<HTMLButtonElement>('[data-heaven-gate-confirm]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!pendingAction) {
          return;
        }
/** action：定义该变量以承载业务值。 */
        const action = pendingAction;
        clearPendingAction();
        options.sendAction(action.kind === 'restore' ? 'restore' : action.kind, 'element' in action ? action.element : undefined);
      });
      if (shouldAnimate && rootsKey) {
        animateValues(body, session, rootsKey);
      } else if (!rootsKey) {
        lastAnimatedRootsKey = null;
      }
    },
  });
}

/** refreshHeavenGateModal：执行对应的业务逻辑。 */
export function refreshHeavenGateModal(player: PlayerState | null | undefined, options: HeavenGateModalOptions): void {
  if (!detailModalHost.isOpenFor(HEAVEN_GATE_OWNER)) {
    return;
  }
  if (!player) {
    detailModalHost.close(HEAVEN_GATE_OWNER);
    return;
  }
/** session：定义该变量以承载业务值。 */
  const session = buildSession(player);
  if (!session) {
    detailModalHost.close(HEAVEN_GATE_OWNER);
    return;
  }
/** nextSessionKey：定义该变量以承载业务值。 */
  const nextSessionKey = getSessionRenderKey(session);
  if (nextSessionKey === lastRenderedSessionKey) {
    return;
  }
  renderHeavenGateModal(player, session, options);
}

/** getHeavenGateHudAction：执行对应的业务逻辑。 */
export function getHeavenGateHudAction(player: PlayerState | null | undefined): { visible: boolean; label: string } | null {
/** session：定义该变量以承载业务值。 */
  const session = player ? buildSession(player) : null;
  if (!session?.unlocked) {
    return null;
  }
  return {
    visible: true,
    label: '开天门',
  };
}

/** openHeavenGateModal：执行对应的业务逻辑。 */
export function openHeavenGateModal(player: PlayerState | null | undefined, options: HeavenGateModalOptions): boolean {
  if (!player) {
    options.showToast('当前未获取到角色状态。');
    return false;
  }
/** session：定义该变量以承载业务值。 */
  const session = buildSession(player);
  if (!session) {
    options.showToast('当前已完成入天门，或暂时不处于可开天门状态。');
    return false;
  }
  renderHeavenGateModal(player, session, options);
  return true;
}

