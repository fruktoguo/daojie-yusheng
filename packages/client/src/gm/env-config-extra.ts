/**
 * gm/env-config-extra.ts —— GM 环境变量、游戏配置与 AI 供应商配置面板。
 *
 * 从 gm.ts 抽取：loadEnvironmentVars/renderEnvironmentVars/saveEnvironmentVar/
 * deleteEnvironmentVar/reloadEnvironmentVars/toggleAllEnvironmentGroups/
 * loadGameConfig/renderGameConfig/saveGameConfig/resetGameConfig/
 * toggleAllGameConfigGroups/loadAiProviderConfigs/renderAiProviderConfigs/
 * 及全部 AI 供应商配置 CRUD 函数。
 * 对 gm.ts 的依赖（request/setStatus/escapeHtml/token/GM_API_BASE_PATH）通过
 * EnvConfigContext 显式注入；状态变量与 DOM 元素在本模块内管理。
 */

import {
  GM_HIGH_RISK_CONFIRMATION_PHRASES,
  type GameConfigDeleteRes,
  type GameConfigItem,
  type GameConfigListRes,
  type GameConfigSetRes,
  type GmAiImageProvider,
  type GmAiProviderConfigDeleteRes,
  type GmAiProviderConfigItem,
  type GmAiProviderConfigListRes,
  type GmAiProviderConfigSetReq,
  type GmAiProviderConfigSetRes,
  type GmAiProviderDeleteModelRes,
  type GmAiProviderFetchModelsRes,
  type GmAiProviderKind,
  type GmAiProviderModelItem,
  type GmAiProviderTestModelRes,
  type GmAiTextProvider,
  type GmEnvironmentVarItem,
  type GmEnvironmentVarListRes,
  type GmHighRiskConfirmationReq,
  type GmReloadEnvironmentVarsRes,
  type GmSetEnvironmentVarReq,
} from '@mud/shared';
import {
  renderEnvironmentVarRowHtml as envConfigRenderEnvironmentVarRowHtml,
  renderGameConfigRowHtml as envConfigRenderGameConfigRowHtml,
  renderGameConfigGroupsHtml as envConfigRenderGameConfigGroupsHtml,
  renderEnvironmentVarGroupsHtml as envConfigRenderEnvironmentVarGroupsHtml,
  renderEnvGroupHtml as envConfigRenderEnvGroupHtml,
} from './env-config';
import {
  resolveAiProviderSelectedModelName as aiProviderResolveSelectedModelName,
  normalizeAiProviderModelSelection as aiProviderNormalizeModelSelection,
  getAiModelStateKey as aiProviderGetModelStateKey,
  renderAiProviderConfigRowHtml as aiProviderRenderConfigRowHtml,
  renderAiProviderModelRowHtml as aiProviderRenderModelRowHtml,
  type AiModelTestState as AiProviderModelTestState,
  type AiProviderDeps as AiProviderDeps,
} from './ai-provider';

import {
  mergeRuntimeFlags,
} from '../constants/world/gm-runtime-flag-registry';

/** RuntimeFlagItem：运行时开关项。 */
interface RuntimeFlagItem {
  key: string;
  value: boolean;
}

/** EnvConfigContext：env-config-extra 对 gm.ts 的依赖。 */
export interface EnvConfigContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  setStatus(message: string, isError?: boolean): void;
  escapeHtml(input: string): string;
  loadRuntimeFlags(): Promise<void>;
  getRuntimeFlags(): RuntimeFlagItem[];
  getRuntimeFlagsLoading(): boolean;
  buildRuntimeFlagsHtml(): string;
  bindRuntimeFlagsEvents(container: HTMLElement): void;
}
const envListEl = document.getElementById('gm-env-list') as HTMLElement;
const envRefreshBtn = document.getElementById('gm-env-refresh') as HTMLButtonElement;
const envReloadBtn = document.getElementById('gm-env-reload') as HTMLButtonElement;
const envExpandBtn = document.getElementById('gm-env-expand') as HTMLButtonElement;
const envCollapseBtn = document.getElementById('gm-env-collapse') as HTMLButtonElement;
const envMetaEl = document.getElementById('gm-env-meta') as HTMLDivElement;
let envVars: GmEnvironmentVarItem[] = [];
let envVarsLoading = false;

export async function loadEnvironmentVars(ctx: EnvConfigContext): Promise<void> {
  if (!ctx.getToken() || envVarsLoading) return;
  envVarsLoading = true;
  renderEnvironmentVars(ctx);
  try {
    const res = await ctx.request<GmEnvironmentVarListRes>(`${ctx.GM_API_BASE_PATH}/environment/vars`);
    envVars = res.items ?? [];
    envVarsLoading = false;
    renderEnvironmentVars(ctx);
  } catch (error) {
    envVarsLoading = false;
    envRefreshBtn.disabled = false;
    envReloadBtn.disabled = false;
    const message = error instanceof Error ? error.message : '加载失败';
    envMetaEl.textContent = message;
    if (envVars.length === 0) {
      envListEl.innerHTML = `<div class="env-empty" style="color:var(--stamp-red);">${ctx.escapeHtml(message)}</div>`;
    }
  }
}

function renderEnvironmentVars(ctx: EnvConfigContext): void {
  envRefreshBtn.disabled = envVarsLoading;
  envReloadBtn.disabled = envVarsLoading;
  envExpandBtn.disabled = envVarsLoading;
  envCollapseBtn.disabled = envVarsLoading;
  if (envVarsLoading) {
    envMetaEl.textContent = '环境变量加载中...';
    return;
  }

  envMetaEl.textContent = `共 ${envVars.length} 个环境变量`;
  envListEl.innerHTML = envConfigRenderEnvironmentVarGroupsHtml(envVars, (item) => renderEnvironmentVarRow(item));

  envListEl.querySelectorAll<HTMLElement>('[data-env-key]').forEach((row) => {
    const key = row.dataset.envKey!;
    const valueInput = row.querySelector<HTMLInputElement>('input[data-env-value]');
    const persistInput = row.querySelector<HTMLInputElement>('input[data-env-persist]');
    const saveBtn = row.querySelector<HTMLButtonElement>('[data-env-save]');
    const deleteBtn = row.querySelector<HTMLButtonElement>('[data-env-delete]');
    if (saveBtn && valueInput && persistInput) {
      saveBtn.addEventListener('click', () => {
        saveEnvironmentVar(key, valueInput.value, persistInput.checked, ctx).catch((error: unknown) => {
          ctx.setStatus(error instanceof Error ? error.message : '保存环境变量失败', true);
        });
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        deleteEnvironmentVar(key, ctx).catch((error: unknown) => {
          ctx.setStatus(error instanceof Error ? error.message : '删除环境变量失败', true);
        });
      });
    }
  });
}

function renderEnvironmentVarRow(item: GmEnvironmentVarItem): string {
  return envConfigRenderEnvironmentVarRowHtml(item);
}

async function saveEnvironmentVar(key: string, value: string, persist: boolean, ctx: EnvConfigContext): Promise<void> {
  if (!value.trim()) {
    throw new Error('环境变量值不能为空');
  }
  await ctx.request(`${ctx.GM_API_BASE_PATH}/environment/vars/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({
      value,
      persist,
      confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_PHRASES.environmentSet,
    } satisfies GmSetEnvironmentVarReq),
  });
  ctx.setStatus(`环境变量 ${key} 已保存${persist ? '并持久化' : ''}`);
  await loadEnvironmentVars(ctx);
}

async function deleteEnvironmentVar(key: string, ctx: EnvConfigContext): Promise<void> {
  if (!confirm(`确认删除环境变量覆盖 "${key}"？`)) return;
  await ctx.request(`${ctx.GM_API_BASE_PATH}/environment/vars/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_PHRASES.environmentDelete,
    } satisfies GmHighRiskConfirmationReq),
  });
  ctx.setStatus(`环境变量 ${key} 已回滚`);
  await loadEnvironmentVars(ctx);
}

export async function reloadEnvironmentVars(ctx: EnvConfigContext): Promise<void> {
  const res = await ctx.request<GmReloadEnvironmentVarsRes>(`${ctx.GM_API_BASE_PATH}/environment/reload`, {
    method: 'POST',
    body: JSON.stringify({
      confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_PHRASES.environmentReload,
    } satisfies GmHighRiskConfirmationReq),
  });
  ctx.setStatus(`本地覆盖已重载：${res.count} 个持久化项`);
  await loadEnvironmentVars(ctx);
}

export function toggleAllEnvironmentGroups(open: boolean, ctx: EnvConfigContext): void {
  envListEl.querySelectorAll<HTMLDetailsElement>('details.env-group').forEach((group) => {
    group.open = open;
  });
}

// ─── 游戏配置中心 ───

const gameConfigListEl = document.getElementById('gm-gameconfig-list') as HTMLElement;
const gameConfigRefreshBtn = document.getElementById('gm-gameconfig-refresh') as HTMLButtonElement;
const gameConfigExpandBtn = document.getElementById('gm-gameconfig-expand') as HTMLButtonElement;
const gameConfigCollapseBtn = document.getElementById('gm-gameconfig-collapse') as HTMLButtonElement;
const gameConfigMetaEl = document.getElementById('gm-gameconfig-meta') as HTMLDivElement;
let gameConfigItems: GameConfigItem[] = [];
let gameConfigLoading = false;

export async function loadGameConfig(ctx: EnvConfigContext): Promise<void> {
  if (!ctx.getToken() || gameConfigLoading) return;
  gameConfigLoading = true;
  renderGameConfig(ctx);
  try {
    const [configRes] = await Promise.all([
      ctx.request<GameConfigListRes>(`${ctx.GM_API_BASE_PATH}/game-config`),
      ctx.loadRuntimeFlags(),
    ]);
    gameConfigItems = configRes.items ?? [];
    gameConfigLoading = false;
    renderGameConfig(ctx);
  } catch (error) {
    gameConfigLoading = false;
    gameConfigRefreshBtn.disabled = false;
    const message = error instanceof Error ? error.message : '加载失败';
    gameConfigMetaEl.textContent = message;
    if (gameConfigItems.length === 0) {
      gameConfigListEl.innerHTML = `<div class="env-empty" style="color:var(--stamp-red);">${ctx.escapeHtml(message)}</div>`;
    }
  }
}

export function renderGameConfig(ctx: EnvConfigContext): void {
  gameConfigRefreshBtn.disabled = gameConfigLoading;
  gameConfigExpandBtn.disabled = gameConfigLoading;
  gameConfigCollapseBtn.disabled = gameConfigLoading;
  if (gameConfigLoading && ctx.getRuntimeFlagsLoading()) {
    gameConfigMetaEl.textContent = '配置加载中...';
    return;
  }

  const totalConfigCount = gameConfigItems.length;
  const flagCount = mergeRuntimeFlags(ctx.getRuntimeFlags()).length;
  gameConfigMetaEl.textContent = `${flagCount} 个运行时开关 · ${totalConfigCount} 项配置`;

  // 运行时开关区块（热生效）
  const flagsSectionHtml = `<details class="env-group" open>
    <summary class="env-group-title">运行时开关（热生效） <span class="env-group-count">(${flagCount})</span></summary>
    <div class="env-group-body" id="gameconfig-flags-container">
      ${ctx.buildRuntimeFlagsHtml()}
    </div>
  </details>`;

  // 游戏配置区块（重启生效）
  const configHtml = envConfigRenderGameConfigGroupsHtml(gameConfigItems, (item) => renderGameConfigRow(item));

  gameConfigListEl.innerHTML = flagsSectionHtml + configHtml;

  // 绑定运行时开关事件
  const flagsContainer = gameConfigListEl.querySelector<HTMLElement>('#gameconfig-flags-container');
  if (flagsContainer) {
    ctx.bindRuntimeFlagsEvents(flagsContainer);
  }

  // 绑定游戏配置事件
  gameConfigListEl.querySelectorAll<HTMLElement>('.env-row[data-config-key]').forEach((rowEl) => {
    const key = rowEl.dataset.configKey!;
    const saveBtn = rowEl.querySelector<HTMLButtonElement>('[data-config-save]');
    const resetBtn = rowEl.querySelector<HTMLButtonElement>('[data-config-reset]');
    const toggleInput = rowEl.querySelector<HTMLInputElement>('[data-config-toggle]');
    const valueInput = rowEl.querySelector<HTMLInputElement>('[data-config-value]');

    if (toggleInput) {
      toggleInput.addEventListener('change', () => {
        saveGameConfig(key, String(toggleInput.checked), ctx).catch((error: unknown) => {
          ctx.setStatus(error instanceof Error ? error.message : '保存配置失败', true);
        });
      });
    }
    if (saveBtn && valueInput) {
      saveBtn.addEventListener('click', () => {
        saveGameConfig(key, valueInput.value, ctx).catch((error: unknown) => {
          ctx.setStatus(error instanceof Error ? error.message : '保存配置失败', true);
        });
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        resetGameConfig(key, ctx).catch((error: unknown) => {
          ctx.setStatus(error instanceof Error ? error.message : '重置配置失败', true);
        });
      });
    }
  });
}

function renderGameConfigRow(item: GameConfigItem): string {
  return envConfigRenderGameConfigRowHtml(item);
}

async function saveGameConfig(key: string, value: string, ctx: EnvConfigContext): Promise<void> {
  await ctx.request<GameConfigSetRes>(`${ctx.GM_API_BASE_PATH}/game-config/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });
  ctx.setStatus(`配置 ${key} 已保存，重启后生效`);
  await loadGameConfig(ctx);
}

async function resetGameConfig(key: string, ctx: EnvConfigContext): Promise<void> {
  if (!confirm(`确认将 "${key}" 恢复为默认值？`)) return;
  await ctx.request<GameConfigDeleteRes>(`${ctx.GM_API_BASE_PATH}/game-config/${encodeURIComponent(key)}`, { method: 'DELETE' });
  ctx.setStatus(`配置 ${key} 已恢复默认`);
  await loadGameConfig(ctx);
}

export function toggleAllGameConfigGroups(open: boolean, ctx: EnvConfigContext): void {
  gameConfigListEl.querySelectorAll<HTMLDetailsElement>('details.env-group').forEach((group) => {
    group.open = open;
  });
}

// ─── AI 配置中心 ───

const aiProviderListEl = document.getElementById('gm-ai-list') as HTMLElement;
const aiProviderRefreshBtn = document.getElementById('gm-ai-refresh') as HTMLButtonElement;
const aiProviderAddTextBtn = document.getElementById('gm-ai-add-text') as HTMLButtonElement;
const aiProviderAddImageBtn = document.getElementById('gm-ai-add-image') as HTMLButtonElement;
const aiProviderMetaEl = document.getElementById('gm-ai-meta') as HTMLDivElement;
let aiProviderConfigs: GmAiProviderConfigItem[] = [];
let aiProviderConfigsLoading = false;
let aiSecretStoreAvailable = false;

const AI_TEXT_PROVIDER_OPTIONS: readonly GmAiTextProvider[] = ['openai', 'openai-compatible', 'anthropic'];
const AI_IMAGE_PROVIDER_OPTIONS: readonly GmAiImageProvider[] = ['openai', 'dashscope'];
const aiModelTestStateByKey = new Map<string, { kind: 'pending' | 'success' | 'error'; text: string }>();

export async function loadAiProviderConfigs(ctx: EnvConfigContext): Promise<void> {
  if (!ctx.getToken() || aiProviderConfigsLoading) return;
  aiProviderConfigsLoading = true;
  renderAiProviderConfigs(ctx);
  try {
    const res = await ctx.request<GmAiProviderConfigListRes>(`${ctx.GM_API_BASE_PATH}/ai/providers`);
    aiProviderConfigs = res.items ?? [];
    aiSecretStoreAvailable = res.secretStoreAvailable;
    aiProviderConfigsLoading = false;
    renderAiProviderConfigs(ctx);
  } catch (error) {
    aiProviderConfigsLoading = false;
    aiProviderRefreshBtn.disabled = false;
    aiProviderAddTextBtn.disabled = false;
    aiProviderAddImageBtn.disabled = false;
    const message = error instanceof Error ? error.message : '加载失败';
    aiProviderMetaEl.textContent = message;
    if (aiProviderConfigs.length === 0) {
      aiProviderListEl.innerHTML = `<div class="env-empty" style="color:var(--stamp-red);">${ctx.escapeHtml(message)}</div>`;
    }
  }
}

function renderAiProviderConfigs(ctx: EnvConfigContext): void {
  aiProviderRefreshBtn.disabled = aiProviderConfigsLoading;
  aiProviderAddTextBtn.disabled = aiProviderConfigsLoading;
  aiProviderAddImageBtn.disabled = aiProviderConfigsLoading;
  if (aiProviderConfigsLoading) {
    aiProviderMetaEl.textContent = 'AI 配置加载中...';
    return;
  }

  const secretNote = aiSecretStoreAvailable ? '密钥存储可用' : '密钥存储不可用：需数据库可用，并配置 SERVER_SECRET_ENCRYPTION_KEY，或存在可复用的 SERVER_PLAYER_TOKEN_SECRET/JWT_SECRET';
  aiProviderMetaEl.textContent = `共 ${aiProviderConfigs.length} 项配置 · ${secretNote}`;

  const rowsByKind = new Map<GmAiProviderKind, GmAiProviderConfigItem[]>();
  rowsByKind.set('text', []);
  rowsByKind.set('image', []);
  for (const item of aiProviderConfigs) {
    rowsByKind.get(item.kind)?.push(item);
  }

  const textRows = rowsByKind.get('text') ?? [];
  const imageRows = rowsByKind.get('image') ?? [];
  aiProviderListEl.innerHTML = `
    ${renderAiProviderGroup('text', '文本模型', textRows, ctx)}
    ${renderAiProviderGroup('image', '图片模型', imageRows, ctx)}
  `;

  aiProviderListEl.querySelectorAll<HTMLElement>('.env-row[data-ai-kind][data-ai-scope]').forEach((rowEl) => {
    const kind = rowEl.dataset.aiKind as GmAiProviderKind;
    const scope = rowEl.dataset.aiScope ?? 'default';
    const saveBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-save]');
    const deleteBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-delete]');
    const fetchModelsBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-fetch-models]');
    const addModelBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-add-model]');
    const deleteAllModelsBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-delete-all-models]');
    const providerSelect = rowEl.querySelector<HTMLSelectElement>('[data-ai-provider]');
    const imageOnlyEls = rowEl.querySelectorAll<HTMLElement>('[data-ai-image-only]');

    providerSelect?.addEventListener('change', () => {
      const isImage = kind === 'image';
      imageOnlyEls.forEach((el) => el.classList.toggle('hidden', !isImage));
    });
    saveBtn?.addEventListener('click', () => {
      saveAiProviderConfig(kind, scope, rowEl, ctx).catch((error: unknown) => {
        ctx.setStatus(error instanceof Error ? error.message : '保存 AI 配置失败', true);
      });
    });
    fetchModelsBtn?.addEventListener('click', () => {
      fetchAiProviderModels(kind, scope, ctx).catch((error: unknown) => {
        ctx.setStatus(error instanceof Error ? error.message : '获取模型列表失败', true);
      });
    });
    addModelBtn?.addEventListener('click', () => {
      addAiProviderModel(rowEl, ctx);
    });
    deleteAllModelsBtn?.addEventListener('click', () => {
      if (rowEl.dataset.aiDraft === 'true') {
        deleteAllAiProviderModelsLocally(rowEl, ctx);
        return;
      }
      deleteAllAiProviderModels(kind, scope, ctx).catch((error: unknown) => {
        ctx.setStatus(error instanceof Error ? error.message : '删除全部模型失败', true);
      });
    });
    deleteBtn?.addEventListener('click', () => {
      deleteAiProviderConfig(kind, scope, ctx).catch((error: unknown) => {
        ctx.setStatus(error instanceof Error ? error.message : '删除 AI 配置失败', true);
      });
    });
    rowEl.querySelectorAll<HTMLButtonElement>('[data-ai-test-model]').forEach((button) => {
      button.addEventListener('click', () => {
        const modelName = button.dataset.aiTestModel ?? '';
        testAiProviderModel(kind, scope, modelName, ctx).catch((error: unknown) => {
          ctx.setStatus(error instanceof Error ? error.message : '测试模型失败', true);
        });
      });
    });
    rowEl.querySelectorAll<HTMLButtonElement>('[data-ai-delete-model]').forEach((button) => {
      button.addEventListener('click', () => {
        const modelName = button.dataset.aiDeleteModel ?? '';
        if (rowEl.dataset.aiDraft === 'true') {
          removeAiProviderModelLocally(rowEl, modelName, ctx);
          return;
        }
        deleteAiProviderModel(kind, scope, modelName, ctx).catch((error: unknown) => {
          ctx.setStatus(error instanceof Error ? error.message : '删除模型失败', true);
        });
      });
    });
  });
}

function renderAiProviderGroup(kind: GmAiProviderKind, label: string, items: GmAiProviderConfigItem[], ctx: EnvConfigContext): string {
  const rows = items.length > 0
    ? items.map((item) => renderAiProviderConfigRow(item)).join('')
    : `<div class="env-empty">当前没有${ctx.escapeHtml(label)}配置。</div>`;
  return envConfigRenderEnvGroupHtml(label, rows, items.length);
}

const aiProviderDeps: AiProviderDeps = {
  textProviderOptions: AI_TEXT_PROVIDER_OPTIONS,
  imageProviderOptions: AI_IMAGE_PROVIDER_OPTIONS,
  get secretStoreAvailable() {
    return aiSecretStoreAvailable;
  },
  getAiModelStateKey,
  aiModelTestStateByKey,
};

function renderAiProviderConfigRow(item: GmAiProviderConfigItem): string {
  return aiProviderRenderConfigRowHtml(item, aiProviderDeps);
}

function renderAiProviderModelRow(item: GmAiProviderConfigItem, model: GmAiProviderModelItem, isSelected: boolean): string {
  return aiProviderRenderModelRowHtml(item, model, isSelected, aiProviderDeps);
}

function getAiModelStateKey(kind: GmAiProviderKind, scope: string, modelName: string): string {
  return aiProviderGetModelStateKey(kind, scope, modelName);
}

function resolveAiProviderSelectedModelName(models: GmAiProviderModelItem[], preferredName = ''): string {
  return aiProviderResolveSelectedModelName(models, preferredName);
}

function normalizeAiProviderModelSelection(models: GmAiProviderModelItem[], preferredName = ''): GmAiProviderModelItem[] {
  return aiProviderNormalizeModelSelection(models, preferredName);
}

export function addAiProviderConfig(kind: GmAiProviderKind, ctx: EnvConfigContext): void {
  const existingScopes = new Set(aiProviderConfigs.filter((item) => item.kind === kind).map((item) => item.scope));
  let scope = 'default';
  if (existingScopes.has(scope)) {
    let index = 2;
    while (existingScopes.has(`${kind}_${index}`)) index += 1;
    scope = `${kind}_${index}`;
  }
  aiProviderConfigs = [
    ...aiProviderConfigs,
    createDraftAiProviderConfig(kind, scope, ctx),
  ];
  renderAiProviderConfigs(ctx);
}

function createDraftAiProviderConfig(kind: GmAiProviderKind, scope: string, ctx: EnvConfigContext): GmAiProviderConfigItem {
  return {
    scope,
    kind,
    provider: kind === 'image' ? 'openai' : 'openai-compatible',
    baseURL: '',
    modelName: kind === 'image' ? 'gpt-image-1.5' : 'gpt-5.4-mini',
    models: [{
      name: kind === 'image' ? 'gpt-image-1.5' : 'gpt-5.4-mini',
      enabled: true,
      source: 'manual',
      addedAt: new Date().toISOString(),
    }],
    timeoutMs: kind === 'image' ? 60_000 : 30_000,
    imageSize: kind === 'image' ? '1024x1024' : '',
    imageQuality: kind === 'image' ? 'medium' : '',
    secretKeyRef: `ai_${scope}_${kind}`,
    secretConfigured: false,
    enabled: true,
    revision: 0,
    updatedBy: '',
    updatedAt: '',
  };
}

async function saveAiProviderConfig(kind: GmAiProviderKind, scope: string, rowEl: HTMLElement, ctx: EnvConfigContext): Promise<void> {
  const provider = rowEl.querySelector<HTMLSelectElement>('[data-ai-provider]')?.value ?? '';
  const baseURL = rowEl.querySelector<HTMLInputElement>('[data-ai-base-url]')?.value ?? '';
  const models = normalizeAiProviderModelSelection(readAiProviderModelsFromRow(rowEl, ctx));
  const modelName = resolveAiProviderSelectedModelName(models);
  const timeoutMsRaw = rowEl.querySelector<HTMLInputElement>('[data-ai-timeout-ms]')?.value ?? '';
  const imageSize = rowEl.querySelector<HTMLInputElement>('[data-ai-image-size]')?.value ?? '';
  const imageQuality = rowEl.querySelector<HTMLInputElement>('[data-ai-image-quality]')?.value ?? '';
  const secretKeyRef = rowEl.querySelector<HTMLInputElement>('[data-ai-secret-ref]')?.value ?? '';
  const apiKey = rowEl.querySelector<HTMLInputElement>('[data-ai-api-key]')?.value ?? '';
  const enabled = rowEl.querySelector<HTMLInputElement>('[data-ai-enabled]')?.checked ?? true;
  const timeoutMs = Number(timeoutMsRaw);

  const body: GmAiProviderConfigSetReq = {
    provider: provider as GmAiTextProvider | GmAiImageProvider,
    baseURL,
    modelName,
    models,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.trunc(timeoutMs) : undefined,
    imageSize: kind === 'image' ? imageSize : undefined,
    imageQuality: kind === 'image' ? imageQuality : undefined,
    secretKeyRef,
    apiKey: apiKey.trim() ? apiKey : undefined,
    enabled,
  };
  const res = await ctx.request<GmAiProviderConfigSetRes>(
    `${ctx.GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  ctx.setStatus(`AI 配置 ${res.item.kind}/${res.item.scope} 已保存${res.secretWritten ? '，密钥已更新' : ''}`);
  await loadAiProviderConfigs(ctx);
}

function readAiProviderModelsFromRow(rowEl: HTMLElement, ctx: EnvConfigContext): GmAiProviderModelItem[] {
  const models: GmAiProviderModelItem[] = [];
  const modelRows = [...rowEl.querySelectorAll<HTMLElement>('[data-ai-model-row]')];
  const selectedModelName = modelRows
    .find((modelEl) => modelEl.querySelector<HTMLInputElement>('[data-ai-model-default]')?.checked)
    ?.dataset.aiModelName?.trim() ?? '';
  modelRows.forEach((modelEl) => {
    const name = modelEl.dataset.aiModelName?.trim() || modelEl.querySelector<HTMLElement>('.ai-model-name')?.textContent?.trim() || '';
    if (!name || models.some((model) => model.name === name)) return;
    const source = modelEl.dataset.aiModelSource === 'fetched' || modelEl.dataset.aiModelSource === 'legacy'
      ? modelEl.dataset.aiModelSource
      : 'manual';
    models.push({
      name,
      enabled: selectedModelName ? name === selectedModelName : models.length === 0,
      source,
      addedAt: modelEl.dataset.aiModelAddedAt || new Date().toISOString(),
    });
  });
  return models;
}

function addAiProviderModel(rowEl: HTMLElement, ctx: EnvConfigContext): void {
  const modelName = prompt('输入模型名');
  if (!modelName?.trim()) return;
  const host = rowEl.querySelector<HTMLElement>('[data-ai-models]');
  if (!host) return;
  if ([...host.querySelectorAll<HTMLElement>('[data-ai-model-row] .ai-model-name')]
    .some((el) => el.textContent?.trim() === modelName.trim())) {
    ctx.setStatus(`模型 ${modelName.trim()} 已存在`, true);
    return;
  }
  const kind = rowEl.dataset.aiKind as GmAiProviderKind;
  const scope = rowEl.dataset.aiScope ?? 'default';
  const item = aiProviderConfigs.find((entry) => entry.kind === kind && entry.scope === scope) ?? createDraftAiProviderConfig(kind, scope, ctx);
  host.insertAdjacentHTML('beforeend', renderAiProviderModelRow(item, {
    name: modelName.trim(),
    enabled: true,
    source: 'manual',
    addedAt: new Date().toISOString(),
  }, false));
  renderAiProviderConfigsFromDom(rowEl, ctx);
}

function renderAiProviderConfigsFromDom(rowEl: HTMLElement, ctx: EnvConfigContext): void {
  const kind = rowEl.dataset.aiKind as GmAiProviderKind;
  const scope = rowEl.dataset.aiScope ?? 'default';
  const index = aiProviderConfigs.findIndex((item) => item.kind === kind && item.scope === scope);
  const models = normalizeAiProviderModelSelection(readAiProviderModelsFromRow(rowEl, ctx));
  if (index >= 0) {
    aiProviderConfigs[index] = {
      ...aiProviderConfigs[index],
      models,
      modelName: resolveAiProviderSelectedModelName(models, aiProviderConfigs[index].modelName),
    };
  }
  renderAiProviderConfigs(ctx);
}

function removeAiProviderModelLocally(rowEl: HTMLElement, modelName: string, ctx: EnvConfigContext): void {
  const modelEl = [...rowEl.querySelectorAll<HTMLElement>('[data-ai-model-row]')]
    .find((el) => el.dataset.aiModelName === modelName);
  modelEl?.remove();
  renderAiProviderConfigsFromDom(rowEl, ctx);
}

function deleteAllAiProviderModelsLocally(rowEl: HTMLElement, ctx: EnvConfigContext): void {
  if (!confirm('确认删除该 provider 下的全部模型？')) return;
  rowEl.querySelectorAll<HTMLElement>('[data-ai-model-row]').forEach((modelEl) => modelEl.remove());
  renderAiProviderConfigsFromDom(rowEl, ctx);
  ctx.setStatus('已清空本地模型列表');
}

async function deleteAiProviderConfig(kind: GmAiProviderKind, scope: string, ctx: EnvConfigContext): Promise<void> {
  if (!confirm(`确认删除 AI 配置 "${kind}/${scope}"？密钥本身不会删除。`)) return;
  const res = await ctx.request<GmAiProviderConfigDeleteRes>(
    `${ctx.GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}`,
    { method: 'DELETE' },
  );
  ctx.setStatus(res.deleted ? `AI 配置 ${kind}/${scope} 已删除` : `AI 配置 ${kind}/${scope} 不存在`);
  await loadAiProviderConfigs(ctx);
}

async function fetchAiProviderModels(kind: GmAiProviderKind, scope: string, ctx: EnvConfigContext): Promise<void> {
  const res = await ctx.request<GmAiProviderFetchModelsRes>(
    `${ctx.GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}/models/fetch`,
    { method: 'POST' },
    45_000,
  );
  const item = aiProviderConfigs.find((entry) => entry.kind === kind && entry.scope === scope);
  if (!item) {
    throw new Error('AI provider 配置不存在');
  }
  const existingNames = new Set(item.models.map((model) => model.name));
  const candidates = res.models.filter((model) => !existingNames.has(model.name));
  if (candidates.length === 0) {
    ctx.setStatus(`已获取 ${res.fetchedCount} 个模型，没有新的可添加模型`);
    return;
  }
  const selected = await openAiModelPicker(candidates, ctx);
  if (selected.length === 0) {
    ctx.setStatus('未选择新模型');
    return;
  }
  await saveAiProviderModels(kind, scope, [...item.models, ...selected], ctx);
  ctx.setStatus(`已添加 ${selected.length} 个模型`);
}

async function deleteAiProviderModel(kind: GmAiProviderKind, scope: string, modelName: string, ctx: EnvConfigContext): Promise<void> {
  if (!modelName.trim()) return;
  if (!confirm(`确认从 "${kind}/${scope}" 删除模型 "${modelName}"？`)) return;
  const res = await ctx.request<GmAiProviderDeleteModelRes>(
    `${ctx.GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}/models/${encodeURIComponent(modelName)}`,
    { method: 'DELETE' },
  );
  ctx.setStatus(res.deleted ? `模型 ${modelName} 已删除` : `模型 ${modelName} 不存在`);
  await loadAiProviderConfigs(ctx);
}

async function deleteAllAiProviderModels(kind: GmAiProviderKind, scope: string, ctx: EnvConfigContext): Promise<void> {
  if (!confirm(`确认删除 "${kind}/${scope}" 下的全部模型？`)) return;
  await saveAiProviderModels(kind, scope, [], ctx);
  ctx.setStatus(`已删除 ${kind}/${scope} 的全部模型`);
}

async function testAiProviderModel(kind: GmAiProviderKind, scope: string, modelName: string, ctx: EnvConfigContext): Promise<void> {
  if (!modelName.trim()) return;
  const stateKey = getAiModelStateKey(kind, scope, modelName);
  aiModelTestStateByKey.set(stateKey, { kind: 'pending', text: '测试中...' });
  renderAiProviderConfigs(ctx);
  const res = await ctx.request<GmAiProviderTestModelRes>(
    `${ctx.GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}/models/${encodeURIComponent(modelName)}/test`,
    { method: 'POST' },
    kind === 'image' ? 45_000 : 30_000,
  );
  aiModelTestStateByKey.set(stateKey, {
    kind: res.ok ? 'success' : 'error',
    text: `${res.ok ? '成功' : '失败'} ${res.latencyMs}ms`,
  });
  renderAiProviderConfigs(ctx);
  ctx.setStatus(`${modelName}：${res.message}（${res.latencyMs}ms）`, !res.ok);
}

async function saveAiProviderModels(kind: GmAiProviderKind, scope: string, models: GmAiProviderModelItem[], ctx: EnvConfigContext): Promise<void> {
  const item = aiProviderConfigs.find((entry) => entry.kind === kind && entry.scope === scope);
  if (!item) throw new Error('AI provider 配置不存在');
  const selectedModels = normalizeAiProviderModelSelection(models, item.modelName);
  const modelName = resolveAiProviderSelectedModelName(selectedModels, item.modelName);
  const body: GmAiProviderConfigSetReq = {
    provider: item.provider,
    baseURL: item.baseURL,
    modelName,
    models: selectedModels,
    timeoutMs: item.timeoutMs,
    imageSize: kind === 'image' ? item.imageSize : undefined,
    imageQuality: kind === 'image' ? item.imageQuality : undefined,
    secretKeyRef: item.secretKeyRef,
    enabled: item.enabled,
  };
  await ctx.request<GmAiProviderConfigSetRes>(
    `${ctx.GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  await loadAiProviderConfigs(ctx);
}

function openAiModelPicker(models: GmAiProviderModelItem[], ctx: EnvConfigContext): Promise<GmAiProviderModelItem[]> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'network-payload-modal';
    overlay.innerHTML = `
      <div class="network-payload-dialog" role="dialog" aria-modal="true" aria-label="选择模型">
        <div class="network-payload-dialog-head">
          <div>
            <div class="section-title">选择要加入的模型</div>
            <div class="network-breakdown-subtitle">仅展示当前 provider 里还没有的模型。</div>
          </div>
          <button class="small-btn" type="button" data-ai-picker-close>关闭</button>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-ai-picker-all>全选</button>
          <button class="small-btn" type="button" data-ai-picker-none>全不选</button>
          <button class="small-btn" type="button" data-ai-picker-invert>反选</button>
          <button class="small-btn primary" type="button" data-ai-picker-confirm>加入选中</button>
        </div>
        <div class="ai-model-picker-list">
          ${models.map((model) => `
            <label class="ai-model-picker-item" title="${ctx.escapeHtml(model.name)}">
              <input type="checkbox" data-ai-picker-model="${ctx.escapeHtml(model.name)}" />
              <span class="ai-model-picker-name">${ctx.escapeHtml(model.name)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
    const close = (result: GmAiProviderModelItem[]) => {
      overlay.remove();
      resolve(result);
    };
    const getInputs = () => [...overlay.querySelectorAll<HTMLInputElement>('[data-ai-picker-model]')];
    overlay.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (target === overlay || target?.closest('[data-ai-picker-close]')) {
        close([]);
        return;
      }
      if (target?.closest('[data-ai-picker-all]')) {
        getInputs().forEach((input) => { input.checked = true; });
        return;
      }
      if (target?.closest('[data-ai-picker-none]')) {
        getInputs().forEach((input) => { input.checked = false; });
        return;
      }
      if (target?.closest('[data-ai-picker-invert]')) {
        getInputs().forEach((input) => { input.checked = !input.checked; });
        return;
      }
      if (target?.closest('[data-ai-picker-confirm]')) {
        const selectedNames = new Set(getInputs().filter((input) => input.checked).map((input) => input.dataset.aiPickerModel ?? ''));
        close(models.filter((model) => selectedNames.has(model.name)));
      }
    });
    document.body.appendChild(overlay);
  });
}

// ===== AI 生成功法 tab =====


/** initEnvConfigEventBindings：绑定环境变量/游戏配置/AI 供应商面板的事件。 */
export function initEnvConfigEventBindings(ctx: EnvConfigContext): void {
  envRefreshBtn.addEventListener('click', () => {
    loadEnvironmentVars(ctx).catch((e) => console.error('[GM]', e));
  });
  envReloadBtn.addEventListener('click', () => {
    reloadEnvironmentVars(ctx).catch((e) => console.error('[GM]', e));
  });
  envExpandBtn.addEventListener('click', () => {
    toggleAllEnvironmentGroups(true, ctx);
  });
  envCollapseBtn.addEventListener('click', () => {
    toggleAllEnvironmentGroups(false, ctx);
  });
  gameConfigRefreshBtn.addEventListener('click', () => {
    loadGameConfig(ctx).catch((e) => console.error('[GM]', e));
  });
  gameConfigExpandBtn.addEventListener('click', () => {
    toggleAllGameConfigGroups(true, ctx);
  });
  gameConfigCollapseBtn.addEventListener('click', () => {
    toggleAllGameConfigGroups(false, ctx);
  });
  aiProviderRefreshBtn.addEventListener('click', () => {
    loadAiProviderConfigs(ctx).catch((e) => console.error('[GM]', e));
  });
  aiProviderAddTextBtn.addEventListener('click', () => {
    addAiProviderConfig('text', ctx);
  });
  aiProviderAddImageBtn.addEventListener('click', () => {
    addAiProviderConfig('image', ctx);
  });
}
