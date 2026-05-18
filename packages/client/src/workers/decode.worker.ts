/**
 * 客户端协议解码 Web Worker。
 * 接收 binary envelope，执行 JSON.parse 解码，返回 plain object。
 * 用于把高频 envelope decode 从 UI 主线程卸载。
 */

interface DecodeRequest {
  id: number;
  event: string;
  binary: ArrayBuffer;
}

interface DecodeResponse {
  id: number;
  event: string;
  payload: unknown;
  error?: string;
}

self.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const { id, event: eventName, binary } = event.data;
  try {
    const text = new TextDecoder().decode(binary);
    const payload = JSON.parse(text);
    const response: DecodeResponse = { id, event: eventName, payload };
    self.postMessage(response);
  } catch (err: unknown) {
    const response: DecodeResponse = {
      id,
      event: eventName,
      payload: null,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
