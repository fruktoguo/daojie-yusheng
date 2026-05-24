/**
 * 本文件负责 功法领悟 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useEffect, useState, type CSSProperties, type PointerEvent, type ReactElement } from 'react';
import type { AttrKey, Attributes, SkillDef, TechniqueCategory, TechniqueGrade } from '@mud/shared';
import { ATTR_KEYS, resolveSkillUnlockLevel } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { ATTR_KEY_LABELS, getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../../../domain-labels';
import { ATTR_COLORS, ATTR_ICON_ATLAS_CELLS } from '../../../constants/ui/attr-panel';
import { formatDisplayInteger, formatDisplaySignedNumber } from '../../../utils/number';
import { FloatingTooltip } from '../../../ui/floating-tooltip';
import { getLocalRealmLevelEntry } from '../../../content/local-templates';

// ─── Store ───────────────────────────────────────────────────────────────────

export interface TechniqueGenerationPanelState {
  visible: boolean;
  available: boolean;
  unavailableReason: string;
  rollRange: {
    realmLvMin: number;
    realmLvMax: number;
    gradeMin: TechniqueGrade;
    gradeMax: TechniqueGrade;
    baseGrade: TechniqueGrade;
    itemSpendMin: number;
    itemSpendMax: number;
    itemSpendDefault: number;
    realmLvChances?: Array<{
      realmLv: number;
      chance: number;
    }>;
    gradeChances: Array<{
      grade: TechniqueGrade;
      chance: number;
    }>;
  } | null;
  generating: boolean;
  currentJob: {
    jobId: string;
    status: string;
    category: string;
    rolledGrade: TechniqueGrade;
    rolledRealmLv: number;
    draftExpireAt?: string;
  } | null;
  currentDraft: {
    jobId: string;
    techniqueId: string;
    suggestedName: string;
    grade: TechniqueGrade;
    category: TechniqueCategory;
    realmLv: number;
    desc: string;
    maxLayer: number;
    fullLevelAttrs?: Partial<Attributes>;
    skills?: SkillDef[];
  } | null;
  error: string;
}

export const { store: techniqueGenerationStore, useStore: useTechniqueGenerationStore } =
  createPanelStore<TechniqueGenerationPanelState>({
    visible: false,
    available: false,
    unavailableReason: '',
    rollRange: null,
    generating: false,
    currentJob: null,
    currentDraft: null,
    error: '',
  });

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface TechniqueGenerationCallbacks {
  onGenerate: ((category: TechniqueCategory, playerContext: string, itemSpend: number) => void) | null;
  onPreviewItemSpend: ((itemSpend: number) => void) | null;
  onAdopt: ((jobId: string, customName: string) => void) | null;
  onDiscard: ((jobId: string) => void) | null;
  onClose: (() => void) | null;
}

const callbacks: TechniqueGenerationCallbacks = {
  onGenerate: null,
  onPreviewItemSpend: null,
  onAdopt: null,
  onDiscard: null,
  onClose: null,
};

export function setTechniqueGenerationCallbacks(cbs: Partial<TechniqueGenerationCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Component ───────────────────────────────────────────────────────────────

type CategoryTab = 'internal' | 'arts' | 'divine' | 'secret';

const CATEGORY_TABS: Array<{ value: CategoryTab; label: string; locked: boolean }> = [
  { value: 'internal', label: '内功', locked: false },
  { value: 'arts', label: '术法', locked: false },
  { value: 'divine', label: '神通', locked: true },
  { value: 'secret', label: '秘术', locked: true },
];

const TECHNIQUE_GRADE_COLORS: Record<TechniqueGrade, string> = {
  mortal: '#8b8f95',
  yellow: '#c79a26',
  mystic: '#4f8fd8',
  earth: '#7b61d1',
  heaven: '#d16b3f',
  spirit: '#1aa37a',
  saint: '#d24f7f',
  emperor: '#d33a2c',
};

const REALM_CHANCE_COLORS = ['#6f8f4f', '#4b9c8d', '#4f8fd8', '#7b61d1', '#b35f93', '#d16b3f'];

let techniqueGenerationTooltip: FloatingTooltip | null = null;

function getTechniqueGenerationTooltip(): FloatingTooltip | null {
  if (typeof document === 'undefined') return null;
  if (!techniqueGenerationTooltip) {
    techniqueGenerationTooltip = new FloatingTooltip();
  }
  return techniqueGenerationTooltip;
}

function showTechniqueGenerationTooltip(
  title: string,
  lines: string[],
  event: PointerEvent<HTMLElement>,
): void {
  getTechniqueGenerationTooltip()?.show(title, lines, event.clientX, event.clientY);
}

function moveTechniqueGenerationTooltip(event: PointerEvent<HTMLElement>): void {
  getTechniqueGenerationTooltip()?.move(event.clientX, event.clientY);
}

function hideTechniqueGenerationTooltip(): void {
  getTechniqueGenerationTooltip()?.hide();
}

function formatTechniqueGenerationRealmLabel(realmLv: number): string {
  return getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
}

export const TechniqueGenerationPanel = memo(function TechniqueGenerationPanel() {
  const state = useTechniqueGenerationStore();
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('internal');
  const [playerContext, setPlayerContext] = useState('');
  const [customName, setCustomName] = useState('');
  const [itemSpend, setItemSpend] = useState(1);

  useEffect(() => () => hideTechniqueGenerationTooltip(), []);

  useEffect(() => {
    if (!state.currentDraft) return;
    setCustomName([...state.currentDraft.suggestedName].slice(0, 8).join(''));
  }, [state.currentDraft?.techniqueId, state.currentDraft?.suggestedName]);

  useEffect(() => {
    const min = state.rollRange?.itemSpendMin ?? 1;
    const max = state.rollRange?.itemSpendMax ?? 1;
    setItemSpend((current) => Math.max(min, Math.min(max, current)));
  }, [state.rollRange?.itemSpendMin, state.rollRange?.itemSpendMax]);

  const handleGenerate = useCallback(() => {
    if (state.generating) return;
    callbacks.onGenerate?.(selectedCategory as TechniqueCategory, playerContext, itemSpend);
  }, [selectedCategory, playerContext, itemSpend, state.generating]);

  const handleItemSpendChange = useCallback((value: number) => {
    const min = state.rollRange?.itemSpendMin ?? 1;
    const max = state.rollRange?.itemSpendMax ?? 1;
    const next = Math.max(min, Math.min(max, Math.trunc(value)));
    setItemSpend(next);
    callbacks.onPreviewItemSpend?.(next);
  }, [state.rollRange?.itemSpendMin, state.rollRange?.itemSpendMax]);

  const handleAdopt = useCallback(() => {
    if (!state.currentDraft?.jobId || !customName.trim()) return;
    callbacks.onAdopt?.(state.currentDraft.jobId, customName.trim());
  }, [state.currentDraft, customName]);

  const handleDiscard = useCallback(() => {
    if (!state.currentDraft?.jobId) return;
    callbacks.onDiscard?.(state.currentDraft.jobId);
  }, [state.currentDraft]);

  if (!state.visible) return null;

  return (
    <div className="technique-generation-panel">
      {!state.available && (
        <div className="technique-generation-panel__state technique-generation-panel__state--locked">
          <strong>暂不可用</strong>
          <span>{state.unavailableReason || '当前无法使用'}</span>
        </div>
      )}

      {state.available && !state.currentDraft && !state.generating && (
        <div className="technique-generation-panel__input">
          <aside className="technique-generation-panel__side technique-generation-panel__side--left">
            {renderRealmRange(state.rollRange)}
            {renderItemSpendSelector(state.rollRange, itemSpend, handleItemSpendChange)}
          </aside>

          <div className="technique-generation-panel__main">
            <section className="technique-generation-panel__section">
              <div className="technique-generation-panel__section-title">功法类型</div>
              <div className="technique-generation-panel__tabs" role="tablist" aria-label="功法类型">
                {CATEGORY_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`technique-generation-panel__tab ${selectedCategory === tab.value ? 'active' : ''} ${tab.locked ? 'locked' : ''}`}
                    disabled={tab.locked}
                    aria-pressed={selectedCategory === tab.value}
                    onClick={() => !tab.locked && setSelectedCategory(tab.value)}
                  >
                    <span>{tab.label}</span>
                    {tab.locked && <small>未开放</small>}
                  </button>
                ))}
              </div>
            </section>

            <section className="technique-generation-panel__section technique-generation-panel__section--context">
              <label className="technique-generation-panel__field-label" htmlFor="technique-generation-context">
                主题描述
                <span>可选</span>
              </label>
              <textarea
                id="technique-generation-context"
                value={playerContext}
                onChange={(e) => setPlayerContext(e.target.value.slice(0, 200))}
                placeholder="描述功法风格、属性倾向或修行意象"
                maxLength={200}
                rows={5}
              />
              <span className="technique-generation-panel__char-count">{[...playerContext].length}/200</span>
            </section>

            <button
              type="button"
              className="technique-generation-panel__generate-btn small-btn"
              onClick={handleGenerate}
            >
              开始领悟
            </button>
          </div>

          <aside className="technique-generation-panel__side technique-generation-panel__side--right">
            {renderGradeRange(state.rollRange)}
          </aside>
        </div>
      )}

      {state.generating && (
        <div className="technique-generation-panel__state technique-generation-panel__state--loading">
          <span className="technique-generation-panel__spinner" aria-hidden="true" />
          <strong>正在推演功法</strong>
          <span>请稍候，结果生成后会自动显示。</span>
        </div>
      )}

      {state.currentDraft && (
        <div className="technique-generation-panel__preview">
          <div className="technique-generation-panel__section-title">领悟结果</div>
          <div className="technique-generation-panel__preview-info">
            <div className="technique-generation-panel__metric">
              <span>品阶</span>
              <strong>{getTechniqueGradeLabel(state.currentDraft.grade)}</strong>
            </div>
            <div className="technique-generation-panel__metric">
              <span>类别</span>
              <strong>{getTechniqueCategoryLabel(state.currentDraft.category)}</strong>
            </div>
            <div className="technique-generation-panel__metric">
              <span>境界</span>
              <strong>Lv.{state.currentDraft.realmLv}</strong>
            </div>
            <div className="technique-generation-panel__metric">
              <span>层数</span>
              <strong>{state.currentDraft.maxLayer}</strong>
            </div>
            {state.currentDraft.desc && (
              <p className="technique-generation-panel__desc">{state.currentDraft.desc}</p>
            )}
            <div className="technique-generation-panel__suggested-name">
              <span>建议名</span>
              <strong>{state.currentDraft.suggestedName}</strong>
            </div>
          </div>

          {state.currentDraft.category === 'internal' && (
            <div className="technique-generation-panel__effect">
              <span>满层六维加成</span>
              {renderTechniqueAttrRadar(state.currentDraft.fullLevelAttrs)}
            </div>
          )}

          {state.currentDraft.category === 'arts' && (
            <div className="technique-generation-panel__effect">
              <span>技能</span>
              {renderPreviewSkills(state.currentDraft.skills)}
            </div>
          )}

          <div className="technique-generation-panel__naming">
            <label className="technique-generation-panel__field-label" htmlFor="technique-generation-name">
              为功法命名
              <span>2-8字</span>
            </label>
            <input
              id="technique-generation-name"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value.slice(0, 8))}
              placeholder={state.currentDraft.suggestedName || '输入功法名'}
              maxLength={8}
            />
          </div>

          <div className="technique-generation-panel__actions">
            <button
              type="button"
              className="small-btn technique-generation-panel__adopt"
              onClick={handleAdopt}
              disabled={!state.currentDraft.jobId || [...customName.trim()].length < 2}
            >
              采纳并学习
            </button>
            <button type="button" className="small-btn ghost" onClick={handleDiscard}>
              放弃
            </button>
          </div>
        </div>
      )}

      {state.error && (
        <div className="technique-generation-panel__error">
          {state.error}
        </div>
      )}
    </div>
  );
});

type TechniqueAttrRadarPoint = {
  x: number;
  y: number;
};

const TECHNIQUE_ATTR_RADAR_CENTER = 170;
const TECHNIQUE_ATTR_RADAR_RADIUS = 110;

function renderTechniqueAttrRadar(attrs: Partial<Attributes> | undefined): ReactElement {
  const values = ATTR_KEYS.map((key) => {
    const value = Number(attrs?.[key] ?? 0);
    return Number.isFinite(value) ? Math.round(value) : 0;
  });
  const maxValue = Math.max(0, ...values.map((value) => Math.max(0, value)));
  if (maxValue <= 0) {
    return <strong>无增益</strong>;
  }

  const scaleStep = maxValue >= 100 ? 50 : maxValue >= 20 ? 10 : 5;
  const scale = Math.max(scaleStep, Math.ceil(maxValue / scaleStep) * scaleStep);
  const pointsAt = (index: number, ratio: number, clamp = true): TechniqueAttrRadarPoint => {
    const clampedRatio = clamp ? Math.max(0, Math.min(1, ratio)) : ratio;
    const angle = ((-90 + index * (360 / ATTR_KEYS.length)) * Math.PI) / 180;
    const radius = TECHNIQUE_ATTR_RADAR_RADIUS * clampedRatio;
    return {
      x: TECHNIQUE_ATTR_RADAR_CENTER + Math.cos(angle) * radius,
      y: TECHNIQUE_ATTR_RADAR_CENTER + Math.sin(angle) * radius,
    };
  };
  const formatPoint = (point: TechniqueAttrRadarPoint): string => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  const formatPercent = (value: number): string => `${((value / 340) * 100).toFixed(3)}%`;
  const nodes = ATTR_KEYS.map((key, index) => {
    const value = values[index] ?? 0;
    return {
      key,
      text: ATTR_KEY_LABELS[key],
      value,
      valueLabel: formatDisplaySignedNumber(value),
      color: ATTR_COLORS[index % ATTR_COLORS.length] ?? ATTR_COLORS[0],
      dot: pointsAt(index, value / scale),
      label: pointsAt(index, 1.14, false),
    };
  });
  const areaPoints = nodes.map((node) => formatPoint(node.dot)).join(' ');
  const rings = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => (
    <polygon
      key={ratio}
      className="attr-radar-ring"
      points={ATTR_KEYS.map((_, index) => formatPoint(pointsAt(index, ratio))).join(' ')}
    />
  ));
  const gradientId = `technique-generation-attr-radar-${scale}`;

  return (
    <div className="attr-radar-shell technique-generation-panel__attr-radar-shell">
      <div className="attr-radar-head">
        <div className="attr-radar-title">六维轮图</div>
        <div className="attr-radar-scale">刻度 {formatDisplaySignedNumber(scale)}</div>
      </div>
      <div className="attr-radar-body technique-generation-panel__attr-radar-body">
        <svg className="attr-radar" viewBox="0 0 340 340" role="img" aria-label="满层六维加成">
          <defs>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="100%">
              {nodes.map((node, index) => {
                const offset = nodes.length === 1 ? '50%' : `${(index / (nodes.length - 1)) * 100}%`;
                return <stop key={node.key} offset={offset} stopColor={node.color} stopOpacity="0.4" />;
              })}
            </linearGradient>
          </defs>
          {rings}
          {nodes.map((node, index) => {
            const axis = pointsAt(index, 1);
            return (
              <line
                key={node.key}
                className="attr-radar-axis"
                x1={TECHNIQUE_ATTR_RADAR_CENTER}
                y1={TECHNIQUE_ATTR_RADAR_CENTER}
                x2={axis.x.toFixed(2)}
                y2={axis.y.toFixed(2)}
                stroke={node.color}
              />
            );
          })}
          <polygon
            className="attr-radar-area"
            points={areaPoints}
            fill={`url(#${gradientId})`}
            stroke={nodes[0]?.color ?? ATTR_COLORS[0]}
            strokeWidth="2"
          />
          {nodes.map((node, index) => (
            <g key={node.key} className="attr-radar-node" data-radar-node={index}>
              <circle
                className="attr-radar-dot"
                cx={node.dot.x.toFixed(2)}
                cy={node.dot.y.toFixed(2)}
                r="6"
                fill={node.color}
                strokeWidth="1.8"
              />
            </g>
          ))}
        </svg>
        {nodes.map((node) => renderTechniqueAttrRadarIcon(node, formatPercent(node.label.x), formatPercent(node.label.y)))}
      </div>
    </div>
  );
}

function renderTechniqueAttrRadarIcon(
  node: { key: AttrKey; text: string; valueLabel: string },
  left: string,
  top: string,
): ReactElement {
  const cell = ATTR_ICON_ATLAS_CELLS[node.key];
  const style: CSSProperties & Record<'--attr-icon-col' | '--attr-icon-row', number> = {
    left,
    top,
    '--attr-icon-col': cell?.col ?? 0,
    '--attr-icon-row': cell?.row ?? 0,
  };
  return (
    <div
      key={node.key}
      className="attr-radar-icon-node technique-generation-panel__attr-radar-node"
      style={style}
      aria-label={`${node.text} ${node.valueLabel}`}
      title={`${node.text} ${node.valueLabel}`}
    >
      {cell && <span className="attr-radar-icon" aria-hidden="true" />}
      <span className="technique-generation-panel__attr-radar-label">{node.text}</span>
      <span className="attr-radar-icon-value">{node.valueLabel}</span>
    </div>
  );
}

function renderRealmRange(range: TechniqueGenerationPanelState['rollRange']): ReactElement {
  if (!range) {
    return (
      <section className="technique-generation-panel__section technique-generation-panel__roll-card">
        <div className="technique-generation-panel__rail-label">境界</div>
        <div className="technique-generation-panel__muted">读取中</div>
      </section>
    );
  }
  const realmLvChances = normalizeRealmLvChances(range);
  return (
    <section className="technique-generation-panel__section technique-generation-panel__roll-card">
      <div
        className="technique-generation-panel__rail-label"
        onPointerMove={(event) => {
          showTechniqueGenerationTooltip('境界等级区间', [
            `${formatTechniqueGenerationRealmLabel(range.realmLvMin)} - ${formatTechniqueGenerationRealmLabel(range.realmLvMax)}`,
          ], event);
          moveTechniqueGenerationTooltip(event);
        }}
        onPointerLeave={hideTechniqueGenerationTooltip}
      >
        境界
      </div>
      <div className="technique-generation-panel__range-group technique-generation-panel__range-group--realm">
        <div className="technique-generation-panel__range-stack" aria-label="境界等级概率分布">
          {realmLvChances.map((entry, index) => (
            <div
              key={entry.realmLv}
              className="technique-generation-panel__range-segment"
              style={{
                flexGrow: Math.max(0.1, entry.chance),
                backgroundColor: REALM_CHANCE_COLORS[index % REALM_CHANCE_COLORS.length],
              }}
              onPointerMove={(event) => {
                showTechniqueGenerationTooltip(formatTechniqueGenerationRealmLabel(entry.realmLv), [`概率 ${entry.chance.toFixed(1)}%`], event);
                moveTechniqueGenerationTooltip(event);
              }}
              onPointerLeave={hideTechniqueGenerationTooltip}
            >
              <span>{entry.realmLv}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function renderGradeRange(range: TechniqueGenerationPanelState['rollRange']): ReactElement {
  if (!range) {
    return (
      <section className="technique-generation-panel__section technique-generation-panel__roll-card">
        <div className="technique-generation-panel__rail-label">品阶</div>
        <div className="technique-generation-panel__muted">读取中</div>
      </section>
    );
  }
  return (
    <section className="technique-generation-panel__section technique-generation-panel__roll-card">
      <div
        className="technique-generation-panel__rail-label"
        onPointerMove={(event) => {
          showTechniqueGenerationTooltip('品阶区间', [
            `${getTechniqueGradeLabel(range.gradeMin)} - ${getTechniqueGradeLabel(range.gradeMax)}`,
            `基准 ${getTechniqueGradeLabel(range.baseGrade)}`,
          ], event);
          moveTechniqueGenerationTooltip(event);
        }}
        onPointerLeave={hideTechniqueGenerationTooltip}
      >
        品阶
      </div>
      <div className="technique-generation-panel__range-group technique-generation-panel__range-group--grade">
        <div className="technique-generation-panel__range-stack" aria-label="品阶概率分布">
          {range.gradeChances.map((entry) => (
            <div
              key={entry.grade}
              className="technique-generation-panel__range-segment"
              style={{
                flexGrow: Math.max(0.1, entry.chance),
                backgroundColor: TECHNIQUE_GRADE_COLORS[entry.grade],
              }}
              onPointerMove={(event) => {
                showTechniqueGenerationTooltip(getTechniqueGradeLabel(entry.grade), [`概率 ${entry.chance.toFixed(1)}%`], event);
                moveTechniqueGenerationTooltip(event);
              }}
              onPointerLeave={hideTechniqueGenerationTooltip}
            >
              <span>{getTechniqueGradeLabel(entry.grade)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function normalizeRealmLvChances(range: NonNullable<TechniqueGenerationPanelState['rollRange']>): Array<{ realmLv: number; chance: number }> {
  if (Array.isArray(range.realmLvChances) && range.realmLvChances.length > 0) {
    return range.realmLvChances;
  }
  const count = Math.max(1, range.realmLvMax - range.realmLvMin + 1);
  const chance = Math.round((1000 / count)) / 10;
  return Array.from({ length: count }, (_, index) => ({
    realmLv: range.realmLvMin + index,
    chance,
  }));
}

function renderItemSpendSelector(
  range: TechniqueGenerationPanelState['rollRange'],
  itemSpend: number,
  onChange: (value: number) => void,
): ReactElement {
  const min = range?.itemSpendMin ?? 1;
  const max = range?.itemSpendMax ?? 1;
  return (
    <section className="technique-generation-panel__section technique-generation-panel__boost-card">
      <div
        className="technique-generation-panel__rail-label"
        onPointerMove={(event) => {
          showTechniqueGenerationTooltip('悟道玉简', [`投入 ${itemSpend} 枚`], event);
          moveTechniqueGenerationTooltip(event);
        }}
        onPointerLeave={hideTechniqueGenerationTooltip}
      >
        玉简
      </div>
      <input
        id="technique-generation-item-spend"
        aria-label="悟道玉简投入数量"
        type="range"
        min={min}
        max={max}
        step={1}
        value={itemSpend}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="technique-generation-panel__stepper" role="group" aria-label="调整悟道玉简数量">
        <button type="button" className="small-btn ghost" onClick={() => onChange(itemSpend + 1)} disabled={itemSpend >= max}>+</button>
        <strong
          onPointerMove={(event) => {
            showTechniqueGenerationTooltip('悟道玉简', [`投入 ${itemSpend} 枚`], event);
            moveTechniqueGenerationTooltip(event);
          }}
          onPointerLeave={hideTechniqueGenerationTooltip}
        >
          {itemSpend}
        </strong>
        <button type="button" className="small-btn ghost" onClick={() => onChange(itemSpend - 1)} disabled={itemSpend <= min}>-</button>
      </div>
    </section>
  );
}

function renderPreviewSkills(skills: SkillDef[] | undefined): ReactElement {
  if (!skills || skills.length === 0) {
    return <strong>无技能</strong>;
  }
  const sortedSkills = [...skills].sort((left, right) => {
    const levelDelta = resolveSkillUnlockLevel(left) - resolveSkillUnlockLevel(right);
    if (levelDelta !== 0) return levelDelta;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
  return (
    <div className="technique-generation-panel__skill-list">
      {sortedSkills.map((skill) => (
        <div key={skill.id} className="technique-generation-panel__skill">
          <div className="technique-generation-panel__skill-head">
            <strong>{skill.name}</strong>
            <span>解锁 Lv.{formatDisplayInteger(resolveSkillUnlockLevel(skill))}</span>
          </div>
          <div className="technique-generation-panel__skill-meta">
            <span>灵力 {formatDisplayInteger(skill.cost)}</span>
            <span>冷却 {formatDisplayInteger(skill.cooldown)} 息</span>
            <span>射程 {formatDisplayInteger(skill.range)}</span>
          </div>
          {skill.desc && <p>{skill.desc}</p>}
        </div>
      ))}
    </div>
  );
}
