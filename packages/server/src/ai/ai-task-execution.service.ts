/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */

/**
 * AI 任务执行服务：编排 sanitizer + text client + token meter + retry。
 *
 * 业务层只需构造 AiTaskRequest，本服务负责调用链路的完整生命周期。
 * 后续 AI 功能（NPC 对话、任务生成等）可直接复用本服务。
 */

import { callTextModelWithConfig, type AiTextCallResult } from './ai-text-client';
import { type AiTextModelConfig } from './ai-model-config';
import { recordAiTokenUsage } from './ai-token-meter';
import { executeWithRetry, type AiRetryConfig } from './ai-retry-policy';

export interface AiTaskRequest {
  /** 业务标识，用于 token 计量分组 */
  taskType: string;
  /** 已解析的模型配置（调用方负责从 AiProviderConfigService 获取） */
  modelConfig: AiTextModelConfig;
  /** system prompt */
  systemMessage?: string;
  /** user prompt */
  userMessage: string;
  /** 期望 JSON 输出时设为 'json_object' */
  responseFormat?: 'json_object' | 'text';
  /** 温度 */
  temperature?: number;
  /** 单次超时 ms（覆盖 retry config） */
  timeoutMs?: number;
  /** 最大尝试次数（覆盖 retry config） */
  maxAttempts?: number;
}

export interface AiTaskResult {
  success: boolean;
  content: string;
  modelName: string;
  requestSnapshot: string;
  attemptCount: number;
  tokenUsage: { promptTokens: number; completionTokens: number };
  error?: string;
  responseId?: string;
}

export async function executeAiTask(request: AiTaskRequest): Promise<AiTaskResult> {
  const retryConfig: Partial<AiRetryConfig> = {};
  if (request.timeoutMs) retryConfig.timeoutMs = request.timeoutMs;
  if (request.maxAttempts) retryConfig.maxAttempts = request.maxAttempts;

  let attemptCount = 0;
  let lastResult: AiTextCallResult | null = null;
  let lastError: string | undefined;

  try {
    lastResult = await executeWithRetry(async (_signal) => {
      attemptCount += 1;
      return callTextModelWithConfig(request.modelConfig, {
        systemMessage: request.systemMessage,
        userMessage: request.userMessage,
        temperature: request.temperature,
        timeoutMs: request.timeoutMs,
      });
    }, retryConfig);
  } catch (error: unknown) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  // 估算 token（实际值需要模型返回，这里用字符数粗估）
  const promptTokens = estimateTokens(
    (request.systemMessage || '') + request.userMessage,
  );
  const completionTokens = estimateTokens(lastResult?.content || '');

  recordAiTokenUsage({
    taskType: request.taskType,
    modelName: request.modelConfig.modelName,
    promptTokens,
    completionTokens,
  });

  if (!lastResult) {
    return {
      success: false,
      content: '',
      modelName: request.modelConfig.modelName,
      requestSnapshot: '',
      attemptCount,
      tokenUsage: { promptTokens, completionTokens },
      error: lastError || 'AI 调用失败',
    };
  }

  return {
    success: true,
    content: lastResult.content,
    modelName: lastResult.modelName,
    requestSnapshot: lastResult.requestSnapshot,
    attemptCount,
    tokenUsage: { promptTokens, completionTokens },
    responseId: lastResult.responseId,
  };
}

/** 粗估 token 数（中文约 1.5 token/字，英文约 0.75 token/word） */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length * 0.6);
}
