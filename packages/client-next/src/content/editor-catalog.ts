import type {
  GmEditorCatalogRes,
} from '@mud/shared-next';
import { LOCAL_EDITOR_CATALOG } from '../constants/world/editor-catalog';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getLocalEditorCatalog(): GmEditorCatalogRes {
  return clone(LOCAL_EDITOR_CATALOG);
}
