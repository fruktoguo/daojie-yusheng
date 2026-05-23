/**
 * 本文件负责 功法领悟 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useState } from 'react';
import type { TechniqueCategory, TechniqueGrade } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../../../domain-labels';

// ─── Store ───────────────────────────────────────────────────────────────────

export interface TechniqueGenerationPanelState {
  visible: boolean;
  available: boolean;
  unavailableReason: string;
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
    techniqueId: string;
    suggestedName: string;
    grade: TechniqueGrade;
    category: TechniqueCategory;
    realmLv: number;
    desc: string;
    maxLayer: number;
  } | null;
  error: string;
}

export const { store: techniqueGenerationStore, useStore: useTechniqueGenerationStore } =
  createPanelStore<TechniqueGenerationPanelState>({
    visible: false,
    available: false,
    unavailableReason: '',
    generating: false,
    currentJob: null,
    currentDraft: null,
    error: '',
  });

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface TechniqueGenerationCallbacks {
  onGenerate: ((category: TechniqueCategory, playerContext: string) => void) | null;
  onAdopt: ((jobId: string, customName: string) => void) | null;
  onDiscard: ((jobId: string) => void) | null;
  onClose: (() => void) | null;
}

const callbacks: TechniqueGenerationCallbacks = {
  onGenerate: null,
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

export const TechniqueGenerationPanel = memo(function TechniqueGenerationPanel() {
  const state = useTechniqueGenerationStore();
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('internal');
  const [playerContext, setPlayerContext] = useState('');
  const [customName, setCustomName] = useState('');

  const handleGenerate = useCallback(() => {
    if (state.generating) return;
    callbacks.onGenerate?.(selectedCategory as TechniqueCategory, playerContext);
  }, [selectedCategory, playerContext, state.generating]);

  const handleAdopt = useCallback(() => {
    if (!state.currentJob?.jobId || !customName.trim()) return;
    callbacks.onAdopt?.(state.currentJob.jobId, customName.trim());
  }, [state.currentJob, customName]);

  const handleDiscard = useCallback(() => {
    if (!state.currentJob?.jobId) return;
    callbacks.onDiscard?.(state.currentJob.jobId);
  }, [state.currentJob]);

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
              disabled={[...customName.trim()].length < 2}
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
