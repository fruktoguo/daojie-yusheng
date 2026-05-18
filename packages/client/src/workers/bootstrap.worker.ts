/**
 * 客户端启动期 Catalog 解析 Web Worker。
 * 把大 JSON 文件的解析和索引构建从主线程卸载。
 * 用于 editor-catalog.generated.json、item-sources.generated.json 等大文件。
 */

interface BootstrapRequest {
  type: 'parse';
  id: string;
  /** JSON 字符串 */
  jsonText: string;
}

interface BootstrapResponse {
  type: 'parsed';
  id: string;
  /** 解析后的对象 */
  data: unknown;
  /** 解析耗时（ms） */
  durationMs: number;
  error?: string;
}

self.onmessage = (event: MessageEvent<BootstrapRequest>) => {
  const { type, id, jsonText } = event.data;
  if (type !== 'parse') return;

  const startedAt = performance.now();
  try {
    const data = JSON.parse(jsonText);
    const response: BootstrapResponse = {
      type: 'parsed',
      id,
      data,
      durationMs: performance.now() - startedAt,
    };
    self.postMessage(response);
  } catch (err: unknown) {
    const response: BootstrapResponse = {
      type: 'parsed',
      id,
      data: null,
      durationMs: performance.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
