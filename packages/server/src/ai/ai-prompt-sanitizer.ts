/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */

/**
 * 玩家输入清洗 + Prompt 注入防御。
 *
 * 所有玩家提供的文本在进入 AI prompt 前必须经过本模块清洗。
 * 长度上限由具体业务显式传入，避免不同 AI 功能共享错误的输入策略。
 */

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

export function sanitizePlayerContext(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  if (!Number.isSafeInteger(maxLength) || maxLength <= 0) return '';

  let text = raw.trim();
  if (!text) return '';

  // 1. 长度截断
  const characters = [...text];
  if (characters.length > maxLength) {
    text = characters.slice(0, maxLength).join('');
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
