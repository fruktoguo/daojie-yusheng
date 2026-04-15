import type {
  GmEditorCatalogRes,
} from '@mud/shared';
import { LOCAL_EDITOR_CATALOG } from '../constants/world/editor-catalog';

/** clone：执行对应的业务逻辑。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** getLocalEditorCatalog：执行对应的业务逻辑。 */
export function getLocalEditorCatalog(): GmEditorCatalogRes {
  return clone(LOCAL_EDITOR_CATALOG);
}

