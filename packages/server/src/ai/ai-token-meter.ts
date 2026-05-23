/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */

/**
 * 全服 AI token 消耗计量器。
 *
 * 内存累计，不做持久化（重启清零可接受）。后续可接 outbox 落盘。
 */

export interface AiTokenUsageRecord {
  taskType: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
}

interface AiTokenUsageBucket {
  promptTokens: number;
  completionTokens: number;
  callCount: number;
}

const usageByTaskType = new Map<string, AiTokenUsageBucket>();
let globalBucket: AiTokenUsageBucket = { promptTokens: 0, completionTokens: 0, callCount: 0 };

export function recordAiTokenUsage(record: AiTokenUsageRecord): void {
  const prompt = Math.max(0, Math.floor(record.promptTokens || 0));
  const completion = Math.max(0, Math.floor(record.completionTokens || 0));
  if (prompt === 0 && completion === 0) return;

  globalBucket.promptTokens += prompt;
  globalBucket.completionTokens += completion;
  globalBucket.callCount += 1;

  const key = record.taskType || 'unknown';
  const bucket = usageByTaskType.get(key);
  if (bucket) {
    bucket.promptTokens += prompt;
    bucket.completionTokens += completion;
    bucket.callCount += 1;
  } else {
    usageByTaskType.set(key, { promptTokens: prompt, completionTokens: completion, callCount: 1 });
  }
}

export interface AiTokenUsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCallCount: number;
  byTaskType: Record<string, { promptTokens: number; completionTokens: number; callCount: number }>;
}

export function getAiTokenUsageSummary(): AiTokenUsageSummary {
  const byTaskType: Record<string, { promptTokens: number; completionTokens: number; callCount: number }> = {};
  for (const [key, bucket] of usageByTaskType) {
    byTaskType[key] = { ...bucket };
  }
  return {
    totalPromptTokens: globalBucket.promptTokens,
    totalCompletionTokens: globalBucket.completionTokens,
    totalCallCount: globalBucket.callCount,
    byTaskType,
  };
}

export function resetAiTokenUsage(): void {
  usageByTaskType.clear();
  globalBucket = { promptTokens: 0, completionTokens: 0, callCount: 0 };
}
