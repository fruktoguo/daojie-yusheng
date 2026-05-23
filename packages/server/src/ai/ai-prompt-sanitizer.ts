/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */

/**
 * 玩家输入清洗 + Prompt 注入防御。
 *
 * 所有玩家提供的文本在进入 AI prompt 前必须经过本模块清洗。
 */

const MAX_PLAYER_CONTEXT_LENGTH = 200;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+previous\s+instructions/i,
  /you\s+are\s+now/i,
  /^system\s*:/im,
  /<\|im_start\|>/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /\bforget\s+(all|everything|your)\b/i,
];

const CONTROL_CHAR_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;

export function sanitizePlayerContext(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  let text = raw.trim();
  if (!text) return '';

  // 1. 长度截断
  if ([...text].length > MAX_PLAYER_CONTEXT_LENGTH) {
    text = [...text].slice(0, MAX_PLAYER_CONTEXT_LENGTH).join('');
  }

  // 2. 剥离控制字符
  text = text.replace(CONTROL_CHAR_REGEX, '');

  // 3. 剥离 markdown 代码块
  text = text.replace(CODE_BLOCK_REGEX, '');

  // 4. 注入模式检测
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return '';
    }
  }

  return text.trim();
}
