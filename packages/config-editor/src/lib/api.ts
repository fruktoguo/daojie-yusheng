/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import type {
  LocalConfigFileListRes,
  LocalConfigFileRes,
  LocalEditorCatalogRes,
  LocalMonsterSaveRes,
  LocalMonsterTemplateListRes,
  LocalServerStatusRes,
  LocalTechniqueListRes,
  LocalTechniqueSaveRes,
  MonsterTemplateRecord,
  LocalTechniqueTemplateRecord,
} from '../types/api';
import type { BasicOkRes } from '@mud/shared';

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const text = await response.text();
      if (text.trim()) {
        try {
          const payload = JSON.parse(text) as { error?: string; message?: string };
          message = payload.error ?? payload.message ?? message;
        } catch { /* use status */ }
      }
    } catch { /* body unreadable */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  maps: {
    list: () => request<{ maps: Array<{ id: string; name: string; category: string; width: number; height: number; mapLv?: number }> }>('/api/maps'),
    get: (id: string) => request<{ id: string; data: unknown }>(`/api/maps/${encodeURIComponent(id)}`),
    put: (id: string, data: unknown) => request<BasicOkRes>(`/api/maps/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  monsters: {
    list: () => request<LocalMonsterTemplateListRes>('/api/monsters'),
    save: (key: string, monster: MonsterTemplateRecord) => request<LocalMonsterSaveRes>('/api/monsters', { method: 'PUT', body: JSON.stringify({ key, monster }) }),
  },
  techniques: {
    list: () => request<LocalTechniqueListRes>('/api/techniques'),
    save: (key: string, technique: LocalTechniqueTemplateRecord) => request<LocalTechniqueSaveRes>('/api/techniques', { method: 'PUT', body: JSON.stringify({ key, technique }) }),
  },
  editorCatalog: {
    get: () => request<LocalEditorCatalogRes>('/api/editor-catalog'),
  },
  configFiles: {
    list: () => request<LocalConfigFileListRes>('/api/config-files'),
    get: (path: string) => request<LocalConfigFileRes>(`/api/config-file?path=${encodeURIComponent(path)}`),
    save: (path: string, content: string) => request<BasicOkRes>('/api/config-file', { method: 'PUT', body: JSON.stringify({ path, content }) }),
  },
  server: {
    status: () => request<LocalServerStatusRes>('/api/server/status'),
    restart: () => request<BasicOkRes>('/api/server/restart', { method: 'POST', body: '{}' }),
  },
};
