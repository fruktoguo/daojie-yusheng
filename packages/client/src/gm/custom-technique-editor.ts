/** GM 手工功法表单控制器。强度计算只由服务端完成。 */
import type {
  AttrKey,
  GmCreateCustomTechniqueReq,
  GmCreateCustomTechniqueRes,
  GmCustomTechniqueArtsSkillInput,
  GmCustomTechniqueInput,
  GmPreviewCustomTechniqueReq,
  GmPreviewCustomTechniqueRes,
  TechniqueArtsStrengthAttributeBaseStat,
} from '@mud/shared';
import { TECHNIQUE_ARTS_STRENGTH_PERCENT_BONUS_KEYS } from '@mud/shared';

const ATTR_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'strength', 'meridians'] as const satisfies readonly AttrKey[];
const ATTRIBUTE_BASE_KEYS = [
  'maxHp',
  'maxQi',
  'physAtk',
  'spellAtk',
  'physDef',
  'spellDef',
  'hit',
  'dodge',
  'crit',
  'antiCrit',
  'breakPower',
  'resolvePower',
] as const satisfies readonly TechniqueArtsStrengthAttributeBaseStat[];
const STRUCTURE_KEYS = ['damage', 'cost', 'cooldown', 'chant', 'castRange', 'area'] as const;
const BONUS_KEYS = TECHNIQUE_ARTS_STRENGTH_PERCENT_BONUS_KEYS;

export interface GmCustomTechniqueEditorOptions {
  apiBasePath: string;
  form: HTMLFormElement;
  internalFields: HTMLElement;
  artsFields: HTMLElement;
  budgetOutput: HTMLOutputElement;
  detailEmpty: HTMLElement;
  detail: HTMLElement;
  detailMeta: HTMLElement;
  detailJson: HTMLTextAreaElement;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  setStatus: (message: string, isError?: boolean) => void;
  onCreated: (techniqueId: string) => void | Promise<void>;
}

export interface GmCustomTechniqueEditor {
  activate(): void;
  preview(): Promise<void>;
}

export function createGmCustomTechniqueEditor(options: GmCustomTechniqueEditorOptions): GmCustomTechniqueEditor {
  const categoryField = getField<HTMLSelectElement>(options.form, 'category');
  const budgetField = getField<HTMLInputElement>(options.form, 'budgetPercent');
  const maxLayerField = getField<HTMLInputElement>(options.form, 'maxLayer');
  const unlockLevelField = getField<HTMLInputElement>(options.form, 'skill.unlockLevel');
  const previewButton = getRequiredButton(options.form, '#custom-technique-preview');
  const createButton = getRequiredButton(options.form, '#custom-technique-create');

  let pendingOperationId: string | null = null;
  let lastOutput = '';
  let lastMeta = '';
  let busy = false;

  const syncCategory = (): void => {
    const isArts = categoryField.value === 'arts';
    options.internalFields.classList.toggle('hidden', isArts);
    options.artsFields.classList.toggle('hidden', !isArts);
    setSectionDisabled(options.internalFields, isArts);
    setSectionDisabled(options.artsFields, !isArts);
  };
  const syncBudget = (): void => {
    options.budgetOutput.value = readFiniteNumber(options.form, 'budgetPercent').toFixed(2);
  };
  const syncUnlockLevelLimit = (): void => {
    const maxLayer = Math.max(3, Math.min(49, Math.trunc(Number(maxLayerField.value) || 3)));
    unlockLevelField.max = String(maxLayer);
    if (Number(unlockLevelField.value) > maxLayer) {
      unlockLevelField.value = String(maxLayer);
    }
  };

  categoryField.addEventListener('change', syncCategory);
  budgetField.addEventListener('input', syncBudget);
  maxLayerField.addEventListener('input', syncUnlockLevelLimit);
  previewButton.addEventListener('click', () => {
    runRequest('preview').catch(() => undefined);
  });
  options.form.addEventListener('submit', (event) => {
    event.preventDefault();
    runRequest('create').catch(() => undefined);
  });
  syncCategory();
  syncBudget();
  syncUnlockLevelLimit();

  async function runRequest(mode: 'preview' | 'create'): Promise<void> {
    if (busy || !options.form.reportValidity()) return;
    setBusy(true);
    try {
      const technique = buildTechniqueInput(options.form);
      if (mode === 'preview') {
        const payload: GmPreviewCustomTechniqueReq = { technique };
        const result = await options.request<GmPreviewCustomTechniqueRes>(
          `${options.apiBasePath}/generated-techniques/preview`,
          { method: 'POST', body: JSON.stringify(payload) },
        );
        showOutput(
          `预览 · ${result.preview.template.name} · ${result.preview.template.grade} · Lv.${result.preview.template.realmLv}`,
          result,
        );
        options.setStatus(`功法预览已更新：${result.preview.template.name}`);
        return;
      }

      pendingOperationId ??= createOperationId();
      const creatorPlayerId = readText(options.form, 'creatorPlayerId');
      const payload: GmCreateCustomTechniqueReq = {
        operationId: pendingOperationId,
        ...(creatorPlayerId ? { creatorPlayerId } : {}),
        technique,
      };
      const result = await options.request<GmCreateCustomTechniqueRes>(
        `${options.apiBasePath}/generated-techniques`,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      pendingOperationId = null;
      showOutput(
        `${result.created ? '已创建' : '幂等重放'} · ${result.preview.template.name} · ${result.techniqueId}`,
        result,
      );
      options.setStatus(`${result.created ? '已创建并发布' : '已确认发布'}功法：${result.preview.template.name}`);
      try {
        await options.onCreated(result.techniqueId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '列表刷新失败';
        options.setStatus(`功法已发布，但列表回读失败：${message}`, true);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '手工功法请求失败';
      if (message.includes('operationId')) {
        pendingOperationId = null;
      }
      showOutput('手工功法请求失败', { error: message });
      options.setStatus(message, true);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  function setBusy(value: boolean): void {
    busy = value;
    previewButton.disabled = value;
    createButton.disabled = value;
    previewButton.textContent = value ? '处理中…' : '预览';
    createButton.textContent = value ? '处理中…' : '创建并发布';
  }

  function showOutput(meta: string, value: unknown): void {
    lastMeta = meta;
    lastOutput = JSON.stringify(value, null, 2);
    options.detailMeta.textContent = lastMeta;
    options.detailJson.value = lastOutput;
    options.detailEmpty.classList.add('hidden');
    options.detail.classList.remove('hidden');
  }

  return {
    activate(): void {
      if (lastOutput) {
        options.detailMeta.textContent = lastMeta;
        options.detailJson.value = lastOutput;
        options.detailEmpty.classList.add('hidden');
        options.detail.classList.remove('hidden');
        return;
      }
      options.detailMeta.textContent = '填写配置后进行服务端预览。';
      options.detailJson.value = '';
      options.detailEmpty.textContent = '尚未预览。';
      options.detailEmpty.classList.remove('hidden');
      options.detail.classList.add('hidden');
    },
    preview: () => runRequest('preview'),
  };
}

function buildTechniqueInput(form: HTMLFormElement): GmCustomTechniqueInput {
  const common = {
    name: readText(form, 'name'),
    ...(readText(form, 'desc') ? { desc: readText(form, 'desc') } : {}),
    grade: readText(form, 'grade') as GmCustomTechniqueInput['grade'],
    realmLv: readFiniteNumber(form, 'realmLv'),
    maxLayer: readFiniteNumber(form, 'maxLayer'),
    expDifficulty: readFiniteNumber(form, 'expDifficulty'),
    budgetPercent: readFiniteNumber(form, 'budgetPercent'),
  };
  if (readText(form, 'category') === 'internal') {
    return {
      ...common,
      category: 'internal',
      attrRatio: readPositiveRecord(form, 'attr', ATTR_KEYS),
    };
  }

  const element = readText(form, 'skill.element');
  const percentBonuses = readNumberRecord(form, 'bonus', BONUS_KEYS);
  const skill: GmCustomTechniqueArtsSkillInput = {
    name: readText(form, 'skill.name'),
    ...(readText(form, 'skill.desc') ? { desc: readText(form, 'skill.desc') } : {}),
    unlockLevel: readFiniteNumber(form, 'skill.unlockLevel'),
    damageKind: readText(form, 'skill.damageKind') as GmCustomTechniqueArtsSkillInput['damageKind'],
    ...(element ? { element: element as GmCustomTechniqueArtsSkillInput['element'] } : {}),
    target: {
      type: readText(form, 'skill.target.type') as GmCustomTechniqueArtsSkillInput['target']['type'],
    },
    structureStrength: readNumberRecord(form, 'structure', STRUCTURE_KEYS),
    formulaStrength: {
      attributeBases: readPositiveRecord(form, 'base', ATTRIBUTE_BASE_KEYS),
      ...(Object.keys(percentBonuses).length > 0 ? { percentBonuses } : {}),
    },
  };
  return { ...common, category: 'arts', skills: [skill] };
}

function readPositiveRecord<Key extends string>(
  form: HTMLFormElement,
  prefix: string,
  keys: readonly Key[],
): Partial<Record<Key, number>> {
  const result: Partial<Record<Key, number>> = {};
  for (const key of keys) {
    const value = readFiniteNumber(form, `${prefix}.${key}`);
    if (value > 0) result[key] = value;
  }
  return result;
}

function readNumberRecord<Key extends string>(
  form: HTMLFormElement,
  prefix: string,
  keys: readonly Key[],
): Record<Key, number> {
  const result = {} as Record<Key, number>;
  for (const key of keys) {
    result[key] = readFiniteNumber(form, `${prefix}.${key}`);
  }
  return result;
}

function readText(form: HTMLFormElement, name: string): string {
  return getField(form, name).value.trim();
}

function readFiniteNumber(form: HTMLFormElement, name: string): number {
  const value = Number(getField(form, name).value);
  return Number.isFinite(value) ? value : 0;
}

function getField<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
  form: HTMLFormElement,
  name: string,
): T {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement) && !(field instanceof HTMLTextAreaElement)) {
    throw new Error(`GM 手工功法字段缺失：${name}`);
  }
  return field as T;
}

function setSectionDisabled(section: HTMLElement, disabled: boolean): void {
  for (const field of section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')) {
    field.disabled = disabled;
  }
}

function getRequiredButton(form: HTMLFormElement, selector: string): HTMLButtonElement {
  const button = form.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`GM 手工功法操作按钮缺失：${selector}`);
  }
  return button;
}

function createOperationId(): string {
  const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `gm-${randomPart}`;
}
