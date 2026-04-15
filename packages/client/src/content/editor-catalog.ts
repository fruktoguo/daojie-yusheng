import type {
  GmEditorCatalogRes,
} from '@mud/shared-next';
import { LOCAL_EDITOR_CATALOG } from '../constants/world/editor-catalog';

/** 深拷贝编辑器目录，确保调用方修改不污染共享常量。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 返回本地编辑器目录的运行时副本，供编辑器工具与 GM 面板使用。 */
export function getLocalEditorCatalog(): GmEditorCatalogRes {
  return clone(LOCAL_EDITOR_CATALOG);
}



