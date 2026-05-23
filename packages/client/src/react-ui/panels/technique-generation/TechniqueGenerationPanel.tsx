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

  const handleClose = useCallback(() => {
    callbacks.onClose?.();
  }, []);

  if (!state.visible) return null;

  return (
    <div className="technique-generation-panel">
      <div className="technique-generation-panel__header">
        <h3>功法领悟</h3>
        <button className="technique-generation-panel__close" onClick={handleClose}>✕</button>
      </div>

      {!state.available && (
        <div className="technique-generation-panel__locked">
          <p>{state.unavailableReason || '当前无法使用'}</p>
        </div>
      )}

      {state.available && !state.currentDraft && !state.generating && (
        <div className="technique-generation-panel__input">
          {/* 分类 Tab */}
          <div className="technique-generation-panel__tabs">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                className={`technique-generation-panel__tab ${selectedCategory === tab.value ? 'active' : ''} ${tab.locked ? 'locked' : ''}`}
                disabled={tab.locked}
                onClick={() => !tab.locked && setSelectedCategory(tab.value)}
              >
                {tab.label}
                {tab.locked && <span className="lock-icon">🔒</span>}
              </button>
            ))}
          </div>

          {/* 提示词输入 */}
          <div className="technique-generation-panel__context">
            <label>主题描述（可选）</label>
            <textarea
              value={playerContext}
              onChange={(e) => setPlayerContext(e.target.value.slice(0, 200))}
              placeholder="描述你想要的功法风格、属性倾向..."
              maxLength={200}
              rows={3}
            />
            <span className="char-count">{[...playerContext].length}/200</span>
          </div>

          {/* 开始按钮 */}
          <button
            className="technique-generation-panel__generate-btn"
            onClick={handleGenerate}
          >
            开始领悟
          </button>
        </div>
      )}

      {state.generating && (
        <div className="technique-generation-panel__loading">
          <div className="spinner" />
          <p>正在凝聚天地灵机推演功法...</p>
        </div>
      )}

      {state.currentDraft && (
        <div className="technique-generation-panel__preview">
          <h4>领悟结果</h4>
          <div className="technique-generation-panel__preview-info">
            <p><strong>品阶：</strong>{getTechniqueGradeLabel(state.currentDraft.grade)}</p>
            <p><strong>类别：</strong>{getTechniqueCategoryLabel(state.currentDraft.category)}</p>
            <p><strong>境界：</strong>Lv.{state.currentDraft.realmLv}</p>
            <p><strong>层数：</strong>{state.currentDraft.maxLayer}</p>
            {state.currentDraft.desc && <p className="desc">{state.currentDraft.desc}</p>}
            <p className="suggested-name">AI 建议名：{state.currentDraft.suggestedName}</p>
          </div>

          {/* 命名输入 */}
          <div className="technique-generation-panel__naming">
            <label>为功法命名</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value.slice(0, 8))}
              placeholder="2~8字"
              maxLength={8}
            />
          </div>

          {/* 操作按钮 */}
          <div className="technique-generation-panel__actions">
            <button
              className="btn-adopt"
              onClick={handleAdopt}
              disabled={[...customName.trim()].length < 2}
            >
              采纳并学习
            </button>
            <button className="btn-discard" onClick={handleDiscard}>
              放弃
            </button>
          </div>
        </div>
      )}

      {state.error && (
        <div className="technique-generation-panel__error">
          <p>{state.error}</p>
        </div>
      )}
    </div>
  );
});
