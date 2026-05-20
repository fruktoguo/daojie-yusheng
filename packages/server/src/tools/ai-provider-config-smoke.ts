import { strict as assert } from 'node:assert';

import {
  __aiImageClientInternals,
  buildDashScopeImageGenerationPayload,
  normalizeGeneratedImageBase64,
  readDashScopeImageGenerationResult,
} from '../ai/ai-image-client';
import {
  normalizeDashScopeImageSize,
  normalizeOpenAIBaseUrl,
  readAiImageModelConfig,
  readAiTextModelConfig,
  resolveDashScopeImageEndpoint,
  resolveImageProvider,
  resolveTextProvider,
} from '../ai/ai-model-config';
import { __aiTextClientInternals } from '../ai/ai-text-client';

const trackedEnvKeys = [
  'AI_TECHNIQUE_MODEL_PROVIDER',
  'AI_TECHNIQUE_MODEL_URL',
  'AI_TECHNIQUE_MODEL_KEY',
  'AI_TECHNIQUE_MODEL_NAME',
  'AI_TECHNIQUE_IMAGE_PROVIDER',
  'AI_TECHNIQUE_IMAGE_MODEL_URL',
  'AI_TECHNIQUE_IMAGE_MODEL_KEY',
  'AI_TECHNIQUE_IMAGE_MODEL_NAME',
  'AI_TECHNIQUE_IMAGE_SIZE',
  'SERVER_AI_TEXT_PROVIDER',
  'SERVER_AI_TEXT_API_KEY',
  'SERVER_AI_TEXT_BASE_URL',
  'SERVER_AI_TEXT_MODEL',
  'SERVER_AI_IMAGE_PROVIDER',
  'SERVER_AI_IMAGE_API_KEY',
  'SERVER_AI_IMAGE_BASE_URL',
  'SERVER_AI_IMAGE_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
] as const;

const previousEnv = new Map<string, string | undefined>();

const captureEnv = (): void => {
  for (const key of trackedEnvKeys) {
    previousEnv.set(key, process.env[key]);
    delete process.env[key];
  }
};

const restoreEnv = (): void => {
  for (const key of trackedEnvKeys) {
    const value = previousEnv.get(key);
    if (typeof value === 'string') {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
};

const run = (): void => {
  captureEnv();
  try {
    assert.equal(normalizeOpenAIBaseUrl('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1');
    assert.equal(normalizeOpenAIBaseUrl('https://example.com'), 'https://example.com/v1');
    assert.equal(
      resolveDashScopeImageEndpoint('https://dashscope.aliyuncs.com'),
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    assert.equal(normalizeDashScopeImageSize('1024x1024'), '1024*1024');
    assert.equal(resolveTextProvider('compatible'), 'openai-compatible');
    assert.equal(resolveImageProvider('auto', 'https://dashscope.aliyuncs.com', 'qwen-image-2.0-pro'), 'dashscope');

    process.env.AI_TECHNIQUE_MODEL_PROVIDER = 'openai-compatible';
    process.env.AI_TECHNIQUE_MODEL_URL = 'https://compat.example.com/v1/chat/completions';
    process.env.AI_TECHNIQUE_MODEL_KEY = 'test-key';
    process.env.AI_TECHNIQUE_MODEL_NAME = 'compat-model';
    const textConfig = readAiTextModelConfig('technique');
    assert.equal(textConfig?.provider, 'openai-compatible');
    assert.equal(textConfig?.baseURL, 'https://compat.example.com/v1');
    assert.equal(textConfig?.modelName, 'compat-model');

    const responsesPayload = __aiTextClientInternals.buildOpenAIResponsesPayload(
      {
        provider: 'openai',
        apiKey: 'key',
        baseURL: 'https://api.openai.com/v1',
        modelName: 'gpt-5.5',
        timeoutMs: 30_000,
        anthropicMaxTokens: 8192,
      },
      {
        systemMessage: 'system',
        userMessage: 'user',
        previousResponseId: 'resp_1',
      },
    );
    assert.equal(responsesPayload.instructions, 'system');
    assert.equal(responsesPayload.input, 'user');
    assert.equal(responsesPayload.previous_response_id, 'resp_1');

    const chatPayload = __aiTextClientInternals.buildOpenAICompatiblePayload(textConfig!, {
      systemMessage: 'system',
      userMessage: 'user',
      temperature: 0.7,
    });
    assert.equal(chatPayload.messages.length, 2);
    assert.equal(chatPayload.temperature, 0.7);

    process.env.AI_TECHNIQUE_IMAGE_PROVIDER = 'dashscope';
    process.env.AI_TECHNIQUE_IMAGE_MODEL_URL = 'https://dashscope.aliyuncs.com';
    process.env.AI_TECHNIQUE_IMAGE_MODEL_KEY = 'image-key';
    process.env.AI_TECHNIQUE_IMAGE_MODEL_NAME = 'qwen-image-2.0-pro';
    process.env.AI_TECHNIQUE_IMAGE_SIZE = '1024x1024';
    const imageConfig = readAiImageModelConfig('technique');
    assert.equal(imageConfig?.provider, 'dashscope');
    assert.equal(imageConfig?.endpoint.endsWith('/api/v1/services/aigc/multimodal-generation/generation'), true);

    const dashPayload = buildDashScopeImageGenerationPayload('qwen-image-2.0-pro', 'prompt', '1024*1024');
    assert.equal(dashPayload.input.messages[0].content[0].text, 'prompt');
    assert.equal(dashPayload.parameters.size, '1024*1024');

    const dashAsset = readDashScopeImageGenerationResult({
      output: {
        choices: [{
          message: {
            content: [{ image: 'https://example.com/a.png' }],
          },
        }],
      },
    });
    assert.equal(dashAsset.url, 'https://example.com/a.png');
    assert.equal(normalizeGeneratedImageBase64('data:image/png;base64,abc'), 'abc');

    const openAiImagePayload = __aiImageClientInternals.buildOpenAIImagePayload(
      {
        provider: 'openai',
        apiKey: 'key',
        baseURL: 'https://api.openai.com/v1',
        endpoint: 'https://api.openai.com/v1',
        modelName: 'gpt-image-1.5',
        size: '1024x1024',
        quality: 'medium',
        timeoutMs: 60_000,
      },
      'prompt',
    );
    assert.equal(openAiImagePayload.model, 'gpt-image-1.5');
    assert.equal(openAiImagePayload.prompt, 'prompt');
  } finally {
    restoreEnv();
  }
};

run();
console.log('[ai-provider-config-smoke] ok');
