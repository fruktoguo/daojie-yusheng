/**
 * 本文件负责客户端内容索引、模板读取或本地展示数据解析。
 *
 * 维护时要区分展示缓存与正式配置真源，避免在客户端内容层重新裁定掉落、资产或战斗规则。
 */
import type {
  GmEditorCatalogRes,
} from '@mud/shared';
import editorCatalog from '../constants/world/editor-catalog.generated.json';

/** 本地 editor catalog 静态快照，只作为 fallback 与预览辅助，不是玩法真源。 */
export const LOCAL_EDITOR_CATALOG = editorCatalog as unknown as GmEditorCatalogRes;

/** 深拷贝编辑器目录，确保调用方修改不污染共享常量。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 返回本地编辑器目录快照的运行时副本。
 * 这里只作为 GM `/api/gm/editor-catalog` 失败时的本地 fallback 与编辑辅助视图，不是玩法真源。
 */
export function getLocalEditorCatalog(): GmEditorCatalogRes {
  return clone(LOCAL_EDITOR_CATALOG);
}

