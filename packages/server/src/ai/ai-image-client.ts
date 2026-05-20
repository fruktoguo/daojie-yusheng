import OpenAI from 'openai';

import {
  normalizeDashScopeImageSize,
  readAiImageModelConfig,
  type AiImageModelConfig,
  type AiImageProvider,
} from './ai-model-config';

export type GeneratedImageAsset = {
  b64: string;
  url: string;
};

export type AiImageGenerationResult = {
  asset: GeneratedImageAsset;
  provider: AiImageProvider;
  modelName: string;
  timeoutMs: number;
};

export type AiImageGenerationParams = {
  modelScope?: string;
  prompt: string;
};

export type DashScopeImageGenerationPayload = {
  model: string;
  input: {
    messages: [{
      role: 'user';
      content: [{
        text: string;
      }];
    }];
  };
  parameters: {
    size: string;
    n: number;
    prompt_extend: boolean;
    watermark: boolean;
  };
};

const DATA_URL_BASE64_PREFIX_REGEXP = /^data:[^;,]+;base64,/i;

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

export const normalizeGeneratedImageBase64 = (raw: string): string => {
  const value = asString(raw);
  if (!value) return '';
  return value.replace(DATA_URL_BASE64_PREFIX_REGEXP, '').trim();
};

export const buildDashScopeImageGenerationPayload = (
  modelName: string,
  prompt: string,
  size: string,
): DashScopeImageGenerationPayload => {
  return {
    model: modelName,
    input: {
      messages: [{
        role: 'user',
        content: [{ text: prompt }],
      }],
    },
    parameters: {
      size,
      n: 1,
      prompt_extend: true,
      watermark: false,
    },
  };
};

export const readDashScopeImageGenerationResult = (
  body: Record<string, unknown>,
): GeneratedImageAsset => {
  const output = body.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { url: '', b64: '' };

  const outputRow = output as Record<string, unknown>;
  const results = Array.isArray(outputRow.results) ? outputRow.results : [];
  const firstResult = results[0];
  if (firstResult && typeof firstResult === 'object' && !Array.isArray(firstResult)) {
    const row = firstResult as Record<string, unknown>;
    const b64 = asString(row.b64_image);
    const url = asString(row.url);
    if (b64 || url) return { b64, url };
  }

  const choices = Array.isArray(outputRow.choices) ? outputRow.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object' || Array.isArray(firstChoice)) return { url: '', b64: '' };

  const message = (firstChoice as Record<string, unknown>).message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return { url: '', b64: '' };

  const contentList = Array.isArray((message as Record<string, unknown>).content)
    ? ((message as Record<string, unknown>).content as unknown[])
    : [];
  for (const content of contentList) {
    if (!content || typeof content !== 'object' || Array.isArray(content)) continue;
    const row = content as Record<string, unknown>;
    const url = asString(row.image) || asString(row.url);
    const b64 = asString(row.b64_image);
    if (url || b64) return { url, b64 };
  }

  return { url: '', b64: '' };
};

const fetchJsonWithTimeout = async (
  endpoint: string,
  payload: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-DashScope-Async': 'disable',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const rawText = await response.text();
      throw new Error(`图像模型请求失败：${response.status} ${rawText.slice(0, 200)}`.trim());
    }
    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
};

const buildOpenAIImagePayload = (
  config: AiImageModelConfig,
  prompt: string,
): OpenAI.Images.ImageGenerateParamsNonStreaming => {
  const payload: OpenAI.Images.ImageGenerateParamsNonStreaming = {
    model: config.modelName,
    prompt,
    size: config.size as OpenAI.Images.ImageGenerateParams['size'],
    stream: false,
  };
  if (config.quality) {
    payload.quality = config.quality as OpenAI.Images.ImageGenerateParams['quality'];
  }
  return payload;
};

const generateDashScopeImage = async (
  config: AiImageModelConfig,
  prompt: string,
): Promise<AiImageGenerationResult> => {
  const payload = buildDashScopeImageGenerationPayload(
    config.modelName,
    prompt,
    normalizeDashScopeImageSize(config.size),
  );
  const body = await fetchJsonWithTimeout(config.endpoint, payload, config.apiKey, config.timeoutMs);
  const asset = readDashScopeImageGenerationResult(body);
  return {
    asset: {
      url: asset.url,
      b64: normalizeGeneratedImageBase64(asset.b64),
    },
    provider: config.provider,
    modelName: config.modelName,
    timeoutMs: config.timeoutMs,
  };
};

const generateOpenAIImage = async (
  config: AiImageModelConfig,
  prompt: string,
): Promise<AiImageGenerationResult> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    maxRetries: 3,
    timeout: config.timeoutMs,
  });
  const response = await client.images.generate(buildOpenAIImagePayload(config, prompt));
  const image = Array.isArray(response.data) ? response.data[0] : undefined;
  return {
    asset: {
      b64: normalizeGeneratedImageBase64(asString(image?.b64_json)),
      url: asString(image?.url),
    },
    provider: config.provider,
    modelName: config.modelName,
    timeoutMs: config.timeoutMs,
  };
};

export const generateConfiguredImageAsset = async (
  params: AiImageGenerationParams,
): Promise<AiImageGenerationResult | null> => {
  const config = readAiImageModelConfig(params.modelScope);
  if (!config) return null;
  if (config.provider === 'dashscope') return generateDashScopeImage(config, params.prompt);
  return generateOpenAIImage(config, params.prompt);
};

export const __aiImageClientInternals = {
  buildOpenAIImagePayload,
  fetchJsonWithTimeout,
};
