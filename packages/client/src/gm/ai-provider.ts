/**
 * gm/ai-provider.ts —— GM AI 供应商配置纯函数与 HTML 渲染。
 *
 * 从 gm.ts 抽取：resolveAiProviderSelectedModelName、normalizeAiProviderModelSelection、
 * renderAiProviderConfigRowHtml、renderAiProviderModelRowHtml。
 * 纯函数，接收类型化数据，返回 HTML 字符串或计算值。
 */

import type {
  GmAiProviderConfigItem,
  GmAiImageProvider,
  GmAiProviderKind,
  GmAiProviderModelItem,
  GmAiTextProvider,
} from '@mud/shared';
import { escapeHtml } from './format';

/** AiModelTestState：AI 模型测试状态。 */
export interface AiModelTestState {
  kind: 'pending' | 'success' | 'error';
  text: string;
}

/** AiProviderDeps：AI 供应商渲染依赖。 */
export interface AiProviderDeps {
  textProviderOptions: readonly GmAiTextProvider[];
  imageProviderOptions: readonly GmAiImageProvider[];
  secretStoreAvailable: boolean;
  getAiModelStateKey: (kind: GmAiProviderKind, scope: string, modelName: string) => string;
  aiModelTestStateByKey: Map<string, AiModelTestState>;
}

/** resolveAiProviderSelectedModelName：解析当前选中的模型名。 */
export function resolveAiProviderSelectedModelName(models: GmAiProviderModelItem[], preferredName = ''): string {
  const preferred = preferredName.trim();
  if (preferred && models.some((model) => model.name === preferred)) {
    return preferred;
  }
  return models.find((model) => model.enabled)?.name ?? models[0]?.name ?? '';
}

/** normalizeAiProviderModelSelection：规范化模型选择状态。 */
export function normalizeAiProviderModelSelection(models: GmAiProviderModelItem[], preferredName = ''): GmAiProviderModelItem[] {
  const selectedName = resolveAiProviderSelectedModelName(models, preferredName);
  if (!selectedName) return [];
  return models.map((model) => ({ ...model, enabled: model.name === selectedName }));
}

/** getAiModelStateKey：获取模型状态键。 */
export function getAiModelStateKey(kind: GmAiProviderKind, scope: string, modelName: string): string {
  return `${kind}:${scope}:${modelName}`;
}

/** renderAiProviderModelRowHtml：渲染 AI 模型行 HTML。 */
export function renderAiProviderModelRowHtml(
  item: GmAiProviderConfigItem,
  model: GmAiProviderModelItem,
  isSelected: boolean,
  deps: AiProviderDeps,
): string {
  const sourceLabel = model.source === 'fetched' ? '接口获取' : model.source === 'legacy' ? '旧配置' : '手动';
  const stateKey = deps.getAiModelStateKey(item.kind, item.scope, model.name);
  const testState = deps.aiModelTestStateByKey.get(stateKey);
  const defaultInputName = `ai-model-default-${item.kind}-${item.scope}`;
  const testStateHtml = testState
    ? `<span class="ai-model-test-state" data-kind="${testState.kind}" title="${escapeHtml(testState.text)}">${escapeHtml(testState.text)}</span>`
    : '<span class="ai-model-test-state" data-kind="idle">未测试</span>';
  return `
    <div class="ai-model-row" data-ai-model-row data-ai-model-name="${escapeHtml(model.name)}" data-ai-model-source="${escapeHtml(model.source)}" data-ai-model-added-at="${escapeHtml(model.addedAt)}">
      <div class="ai-model-name" title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</div>
      <div class="ai-model-meta">
        <span>${escapeHtml(sourceLabel)}</span>
        <span>${isSelected ? '当前使用' : '备用'}</span>
        ${testStateHtml}
      </div>
      <div class="ai-model-actions">
        <label class="env-persist-label"><input data-ai-model-default type="radio" name="${escapeHtml(defaultInputName)}" ${isSelected ? 'checked' : ''} />使用</label>
        <button class="small-btn" type="button" data-ai-test-model="${escapeHtml(model.name)}" ${item.secretConfigured ? '' : 'disabled'}>测试</button>
        <button class="small-btn danger" type="button" data-ai-delete-model="${escapeHtml(model.name)}">删除模型</button>
      </div>
    </div>
  `;
}

/** renderAiProviderConfigRowHtml：渲染 AI 供应商配置行 HTML。 */
export function renderAiProviderConfigRowHtml(
  item: GmAiProviderConfigItem,
  deps: AiProviderDeps,
): string {
  const providerOptions = (item.kind === 'image' ? deps.imageProviderOptions : deps.textProviderOptions)
    .map((provider) => `<option value="${provider}" ${provider === item.provider ? 'selected' : ''}>${provider}</option>`)
    .join('');
  const enabledBadge = item.enabled ? '<span class="env-badge source-process_env">已启用</span>' : '<span class="env-badge source-unset">已禁用</span>';
  const secretBadge = item.secretConfigured ? '<span class="env-badge source-runtime_file">密钥已配置</span>' : '<span class="env-badge meta">密钥未配置</span>';
  const imageFieldsClass = item.kind === 'image' ? '' : 'hidden';
  const models = normalizeAiProviderModelSelection(item.models, item.modelName);
  const selectedModelName = resolveAiProviderSelectedModelName(models, item.modelName);
  const modelRowsHtml = models.length > 0
    ? models.map((model) => renderAiProviderModelRowHtml(item, model, model.name === selectedModelName, deps)).join('')
    : '<div class="ai-model-row"><div class="ai-model-name">当前没有模型</div><div class="ai-model-meta">请手动添加或获取模型列表</div><div class="ai-model-actions"></div></div>';
  return `
    <div class="env-row" data-ai-kind="${escapeHtml(item.kind)}" data-ai-scope="${escapeHtml(item.scope)}" data-ai-draft="${item.revision <= 0 ? 'true' : 'false'}">
      <div class="env-row-head">
        <div class="env-row-title">
          <span class="env-label">${escapeHtml(item.kind === 'text' ? '文本模型' : '图片模型')} · ${escapeHtml(item.scope)}</span>
          <code class="env-key">revision ${escapeHtml(String(item.revision))} · ${escapeHtml(item.updatedAt || '未保存')}</code>
        </div>
        <div class="env-row-badges">
          ${enabledBadge}
          ${secretBadge}
          <span class="env-badge meta">${escapeHtml(item.provider)}</span>
        </div>
      </div>
      <div class="env-desc">scope 用于区分默认模型和未来细分场景；API Key 留空表示沿用当前密钥引用。</div>
      <div class="env-edit">
        <label class="env-persist-label"><input data-ai-enabled type="checkbox" ${item.enabled ? 'checked' : ''} />启用</label>
        <select data-ai-provider>${providerOptions}</select>
        <input data-ai-base-url type="text" value="${escapeHtml(item.baseURL)}" placeholder="Base URL，例如 https://api.example.com" />
        <input data-ai-timeout-ms type="number" min="1000" max="300000" step="1000" value="${escapeHtml(String(item.timeoutMs || (item.kind === 'image' ? 60000 : 30000)))}" placeholder="超时 ms" />
      </div>
      <div class="env-edit ${imageFieldsClass}" data-ai-image-only>
        <input data-ai-image-size type="text" value="${escapeHtml(item.imageSize || '1024x1024')}" placeholder="图片尺寸，例如 1024x1024" />
        <input data-ai-image-quality type="text" value="${escapeHtml(item.imageQuality || 'medium')}" placeholder="图片质量，例如 medium" />
      </div>
      <div class="env-edit">
        <input data-ai-secret-ref type="text" value="${escapeHtml(item.secretKeyRef)}" placeholder="密钥引用名，例如 ai_default_text" />
        <input data-ai-api-key type="password" value="" placeholder="${deps.secretStoreAvailable ? '可选：输入新 API Key 覆盖密钥' : '密钥存储不可用'}" ${deps.secretStoreAvailable ? '' : 'disabled'} autocomplete="new-password" />
        <div class="env-actions">
          <button class="small-btn primary" type="button" data-ai-save>保存</button>
          <button class="small-btn" type="button" data-ai-fetch-models ${item.secretConfigured ? '' : 'disabled'}>获取模型列表</button>
          <button class="small-btn" type="button" data-ai-add-model>手动添加模型</button>
          <button class="small-btn danger" type="button" data-ai-delete-all-models ${models.length > 0 ? '' : 'disabled'}>删除全部模型</button>
          <button class="small-btn danger" type="button" data-ai-delete>删除配置</button>
        </div>
      </div>
      <div class="ai-model-table" data-ai-models>
        ${modelRowsHtml}
      </div>
    </div>
  `;
}
