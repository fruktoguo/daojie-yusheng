/**
 * 用途：统一解码 smoke socket 载荷。
 */

export function decodeSmokePayload(payload: unknown): unknown {
  if (Buffer.isBuffer(payload)) {
    return decodeSmokePayloadText(payload.toString('utf8')) ?? payload;
  }
  if (payload instanceof Uint8Array) {
    return decodeSmokePayloadText(Buffer.from(payload).toString('utf8')) ?? payload;
  }
  if (typeof payload === 'string') {
    return decodeSmokePayloadText(payload) ?? payload;
  }
  return payload;
}

function decodeSmokePayloadText(text: string): unknown | null {
  const trimmed = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return null;
  }
  const candidates = [trimmed];
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }
  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 继续尝试更宽松的截取。
    }
  }
  return null;
}
