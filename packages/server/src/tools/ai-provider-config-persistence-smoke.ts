import { strict as assert } from 'node:assert';

import { __aiTextClientInternals } from '../ai/ai-text-client';
import { AiProviderConfigPersistenceService } from '../ai/ai-provider-config-persistence.service';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';

const hasDatabase = (): boolean => {
  return Boolean((resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl()).trim());
};

const run = async (): Promise<void> => {
  if (!hasDatabase()) {
    console.log('[ai-provider-config-persistence-smoke] skipped: database url is not configured');
    return;
  }

  const databasePoolProvider = new DatabasePoolProvider();
  const persistence = new AiProviderConfigPersistenceService(databasePoolProvider);
  const scope = `smoke_${Date.now()}_${Math.trunc(Math.random() * 1_000_000)}`;

  try {
    await persistence.ensureInitialized();
    assert.equal(persistence.isEnabled(), true);

    const created = await persistence.upsert({
      scope,
      kind: 'text',
      provider: 'openai',
      baseURL: 'https://api.example.com/v1',
      modelName: 'gpt-5.5',
      timeoutMs: 12_345,
      secretKeyRef: 'ai_smoke_text_key',
      enabled: true,
      updatedBy: 'ai-provider-config-persistence-smoke',
    });
    assert.equal(created?.scope, scope);
    assert.equal(created?.kind, 'text');
    assert.equal(created?.provider, 'openai');
    assert.equal(created?.revision, 1);

    const updated = await persistence.upsert({
      scope,
      kind: 'text',
      provider: 'openai-compatible',
      baseURL: 'https://compat.example.com',
      modelName: 'compat-model',
      timeoutMs: 23_456,
      secretKeyRef: 'ai_smoke_text_key_v2',
      enabled: false,
      updatedBy: 'ai-provider-config-persistence-smoke',
    });
    assert.equal(updated?.provider, 'openai-compatible');
    assert.equal(updated?.enabled, false);
    assert.equal(updated?.revision, 2);

    const loaded = await persistence.get(scope, 'text');
    assert.equal(loaded?.secretKeyRef, 'ai_smoke_text_key_v2');
    assert.equal(loaded?.timeoutMs, 23_456);

    const image = await persistence.upsert({
      scope,
      kind: 'image',
      provider: 'dashscope',
      baseURL: 'https://dashscope.aliyuncs.com',
      modelName: 'qwen-image-2.0-pro',
      timeoutMs: 60_000,
      imageSize: '1024x1024',
      imageQuality: 'medium',
      secretKeyRef: 'ai_smoke_image_key',
      enabled: true,
      updatedBy: 'ai-provider-config-persistence-smoke',
    });
    assert.equal(image?.imageSize, '1024x1024');

    const list = await persistence.list();
    assert.equal(list.some((entry) => entry.scope === scope && entry.kind === 'text'), true);
    assert.equal(list.some((entry) => entry.scope === scope && entry.kind === 'image'), true);

    const request = __aiTextClientInternals.buildOpenAIResponsesPayload({
      provider: 'openai',
      apiKey: 'test-key',
      baseURL: 'https://api.example.com/v1',
      modelName: 'gpt-5.5',
      timeoutMs: 30_000,
      anthropicMaxTokens: 8192,
    }, {
      systemMessage: 'system',
      userMessage: 'user',
    });
    assert.equal(request.model, 'gpt-5.5');
    assert.equal(request.instructions, 'system');
    assert.equal(request.input, 'user');
  } finally {
    await persistence.delete(scope, 'text').catch(() => undefined);
    await persistence.delete(scope, 'image').catch(() => undefined);
    await persistence.onModuleDestroy();
    await databasePoolProvider.onModuleDestroy();
  }

  console.log('[ai-provider-config-persistence-smoke] ok');
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
