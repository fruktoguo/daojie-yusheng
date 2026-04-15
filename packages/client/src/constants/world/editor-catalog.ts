import type { GmEditorCatalogRes } from '@mud/shared-next';
import editorCatalog from './editor-catalog.generated.json';

/** 本地 GM 编辑器目录静态快照。 */
export const LOCAL_EDITOR_CATALOG = editorCatalog as unknown as GmEditorCatalogRes;
