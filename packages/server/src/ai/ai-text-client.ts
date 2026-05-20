import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import {
  readAiTextModelConfig,
  type AiTextModelConfig,
  type AiTextProvider,
} from './ai-model-config';

export type AiTextCallResult = {
  provider: AiTextProvider;
  modelName: string;
  requestSnapshot: string;
  content: string;
  responseId?: string;
};

export type AiTextCallParams = {
  modelScope?: string;
  systemMessage?: string;
  userMessage: string;
  previousResponseId?: string;
  temperature?: number;
  timeoutMs?: number;
};

type OpenAIChatContentPart = {
  text?: string | null;
};

const normalizeTextContent = (rawContent: unknown): string => {
  if (typeof rawContent === 'string') return rawContent;
  if (!Array.isArray(rawContent)) return '';
  return rawContent
    .map((entry): string => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
      const row = entry as OpenAIChatContentPart;
      return typeof row.text === 'string' ? row.text : '';
    })
    .join('');
};

const buildOpenAIResponsesPayload = (
  config: AiTextModelConfig,
  params: AiTextCallParams,
): OpenAI.Responses.ResponseCreateParamsNonStreaming => {
  const payload: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: config.modelName,
    input: params.userMessage,
  };
  if (params.systemMessage) payload.instructions = params.systemMessage;
  if (params.previousResponseId) payload.previous_response_id = params.previousResponseId;
  if (typeof params.temperature === 'number') payload.temperature = params.temperature;
  return payload;
};

const callOpenAIResponses = async (
  config: AiTextModelConfig,
  params: AiTextCallParams,
): Promise<AiTextCallResult> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: params.timeoutMs ?? config.timeoutMs,
  });
  const payload = buildOpenAIResponsesPayload(config, params);
  const response = await client.responses.create(payload);
  return {
    provider: config.provider,
    modelName: config.modelName,
    requestSnapshot: JSON.stringify(payload),
    content: response.output_text,
    responseId: response.id,
  };
};

const buildOpenAICompatiblePayload = (
  config: AiTextModelConfig,
  params: AiTextCallParams,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming => {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (params.systemMessage) {
    messages.push({ role: 'system', content: params.systemMessage });
  }
  messages.push({ role: 'user', content: params.userMessage });

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: config.modelName,
    messages,
  };
  if (typeof params.temperature === 'number') payload.temperature = params.temperature;
  return payload;
};

const callOpenAICompatibleChat = async (
  config: AiTextModelConfig,
  params: AiTextCallParams,
): Promise<AiTextCallResult> => {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: params.timeoutMs ?? config.timeoutMs,
  });
  const payload = buildOpenAICompatiblePayload(config, params);
  const completion = await client.chat.completions.create(payload);
  return {
    provider: config.provider,
    modelName: config.modelName,
    requestSnapshot: JSON.stringify(payload),
    content: normalizeTextContent(completion.choices[0]?.message?.content),
  };
};

const extractAnthropicText = (content: Anthropic.Messages.ContentBlock[]): string => {
  return content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
};

const buildAnthropicPayload = (
  config: AiTextModelConfig,
  params: AiTextCallParams,
): Anthropic.Messages.MessageCreateParamsNonStreaming => {
  const payload: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: config.modelName,
    max_tokens: config.anthropicMaxTokens,
    messages: [{ role: 'user', content: params.userMessage }],
  };
  if (params.systemMessage) payload.system = params.systemMessage;
  if (typeof params.temperature === 'number') payload.temperature = params.temperature;
  return payload;
};

const callAnthropicMessages = async (
  config: AiTextModelConfig,
  params: AiTextCallParams,
): Promise<AiTextCallResult> => {
  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    timeout: params.timeoutMs ?? config.timeoutMs,
  });
  const payload = buildAnthropicPayload(config, params);
  const message = await client.messages.create(payload);
  return {
    provider: config.provider,
    modelName: config.modelName,
    requestSnapshot: JSON.stringify(payload),
    content: extractAnthropicText(message.content),
    responseId: message.id,
  };
};

export const callConfiguredTextModel = async (
  params: AiTextCallParams,
): Promise<AiTextCallResult | null> => {
  const config = readAiTextModelConfig(params.modelScope);
  if (!config) return null;
  if (config.provider === 'anthropic') return callAnthropicMessages(config, params);
  if (config.provider === 'openai-compatible') return callOpenAICompatibleChat(config, params);
  return callOpenAIResponses(config, params);
};

export const __aiTextClientInternals = {
  buildAnthropicPayload,
  buildOpenAICompatiblePayload,
  buildOpenAIResponsesPayload,
  normalizeTextContent,
};
