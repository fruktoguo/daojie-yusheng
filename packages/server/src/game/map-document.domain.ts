import {
  buildEditableMapList as buildEditableMapListResult,
  GmMapDocument,
  GmMapListRes,
  GmMapSummary,
} from '@mud/shared';
import * as fs from 'fs';
import * as path from 'path';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { MAP_DOCUMENT_SCOPE, MapData, SyncedMapDocument } from './map.service.shared';
import { MapEditableDomain } from './map-editable.domain';

/** EditableMapCatalogMeta：定义该类型的结构与数据语义。 */
type EditableMapCatalogMeta = Pick<GmMapSummary, 'catalogMode' | 'catalogGroupId' | 'catalogGroupName' | 'sourcePath'>;

/** MapDocumentDomainOptions：定义该接口的能力与字段约束。 */
interface MapDocumentDomainOptions {
/** mapsDir：定义该变量以承载业务值。 */
  mapsDir: string;
  getLoadedMaps: () => Iterable<MapData>;
  getLoadedMap: (mapId: string) => MapData | undefined;
  loadMapIntoRuntime: (document: GmMapDocument, previousDocument?: GmMapDocument) => void;
  afterDocumentMutation: () => void;
  log: (message: string) => void;
  error: (message: string) => void;
}

/** MapDocumentDomain：封装相关状态与行为。 */
export class MapDocumentDomain {
  constructor(
    private readonly persistentDocumentService: PersistentDocumentService,
    private readonly editableDomain: MapEditableDomain,
    private readonly options: MapDocumentDomainOptions,
  ) {}

/** syncMapDocumentsFromFiles：执行对应的业务逻辑。 */
  async syncMapDocumentsFromFiles(): Promise<SyncedMapDocument[]> {
/** persistedDocuments：定义该变量以承载业务值。 */
    const persistedDocuments = await this.persistentDocumentService.getScope<unknown>(MAP_DOCUMENT_SCOPE);
/** persistedByMapId：定义该变量以承载业务值。 */
    const persistedByMapId = new Map<string, GmMapDocument>(
      persistedDocuments.map((entry) => [entry.key, this.editableDomain.normalizeEditableMapDocument(entry.payload)]),
    );

/** files：定义该变量以承载业务值。 */
    const files = this.collectMapJsonFiles(this.options.mapsDir);

/** synced：定义该变量以承载业务值。 */
    const synced: SyncedMapDocument[] = [];
/** fileMapIds：定义该变量以承载业务值。 */
    const fileMapIds = new Set<string>();
/** createdCount：定义该变量以承载业务值。 */
    let createdCount = 0;
/** updatedCount：定义该变量以承载业务值。 */
    let updatedCount = 0;

    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
/** normalized：定义该变量以承载业务值。 */
        const normalized = this.editableDomain.normalizeEditableMapDocument(raw);
/** nextPayload：定义该变量以承载业务值。 */
        const nextPayload = this.editableDomain.dehydrateEditableMapDocument(normalized);
/** previousDocument：定义该变量以承载业务值。 */
        const previousDocument = persistedByMapId.get(normalized.id);
/** previousPayload：定义该变量以承载业务值。 */
        const previousPayload = previousDocument ? this.editableDomain.dehydrateEditableMapDocument(previousDocument) : null;
        if (JSON.stringify(previousPayload) !== JSON.stringify(nextPayload)) {
          await this.persistentDocumentService.save(MAP_DOCUMENT_SCOPE, normalized.id, nextPayload);
          if (previousDocument) {
            updatedCount += 1;
          } else {
            createdCount += 1;
          }
        }
        fileMapIds.add(normalized.id);
        synced.push({ document: normalized, previousDocument });
      } catch (error) {
/** message：定义该变量以承载业务值。 */
        const message = error instanceof Error ? error.message : String(error);
        this.options.error(`地图同步失败 ${file}: ${message}`);
      }
    }

/** deletedCount：定义该变量以承载业务值。 */
    let deletedCount = 0;
    for (const mapId of persistedByMapId.keys()) {
      if (fileMapIds.has(mapId)) {
        continue;
      }
      await this.persistentDocumentService.delete(MAP_DOCUMENT_SCOPE, mapId);
      deletedCount += 1;
    }

    if (createdCount > 0 || updatedCount > 0 || deletedCount > 0) {
      this.options.log(`已同步地图静态镜像：新增 ${createdCount} 张，更新 ${updatedCount} 张，删除 ${deletedCount} 张`);
    }

    return synced;
  }

/** buildEditableMapCatalogMetaById：执行对应的业务逻辑。 */
  buildEditableMapCatalogMetaById(): Map<string, EditableMapCatalogMeta> {
/** result：定义该变量以承载业务值。 */
    const result = new Map<string, EditableMapCatalogMeta>();
/** files：定义该变量以承载业务值。 */
    const files = this.collectMapJsonFiles(this.options.mapsDir);
    for (const filePath of files) {
      const relativePath = path.relative(this.options.mapsDir, filePath).replace(/\\/g, '/');
      const mapId = path.basename(filePath, '.json');
      if (relativePath.startsWith('compose/')) {
/** segments：定义该变量以承载业务值。 */
        const segments = relativePath.split('/');
/** catalogGroupId：定义该变量以承载业务值。 */
        const catalogGroupId = segments[1]?.trim() || this.inferComposeGroupIdFromMapId(mapId);
        result.set(mapId, {
          catalogMode: 'piece',
          catalogGroupId,
          catalogGroupName: this.options.getLoadedMap(catalogGroupId)?.source.name ?? catalogGroupId,
          sourcePath: relativePath,
        });
        continue;
      }
      result.set(mapId, {
        catalogMode: 'main',
        sourcePath: relativePath,
      });
    }
    return result;
  }

/** getEditableMapList：执行对应的业务逻辑。 */
  getEditableMapList(): GmMapListRes {
/** baseList：定义该变量以承载业务值。 */
    const baseList = buildEditableMapListResult([...this.options.getLoadedMaps()].map((map) => map.source));
/** catalogMetaById：定义该变量以承载业务值。 */
    const catalogMetaById = this.buildEditableMapCatalogMetaById();
    return {
      maps: baseList.maps.map((summary) => ({
        ...summary,
        ...catalogMetaById.get(summary.id),
      })),
    };
  }

/** getEditableMap：执行对应的业务逻辑。 */
  getEditableMap(mapId: string): GmMapDocument | undefined {
/** map：定义该变量以承载业务值。 */
    const map = this.options.getLoadedMap(mapId);
    if (!map) {
      return undefined;
    }
    return this.editableDomain.cloneMapDocument(map.source);
  }

/** saveEditableMap：执行对应的业务逻辑。 */
  async saveEditableMap(mapId: string, document: GmMapDocument): Promise<string | null> {
    if (mapId !== document.id) {
      return '地图 ID 不允许在编辑器中直接修改';
    }

/** normalized：定义该变量以承载业务值。 */
    const normalized = this.editableDomain.normalizeEditableMapDocument(document);
/** error：定义该变量以承载业务值。 */
    const error = this.editableDomain.validateEditableMapDocument(normalized);
    if (error) {
      return error;
    }

/** filePath：定义该变量以承载业务值。 */
    const filePath = path.join(this.options.mapsDir, `${mapId}.json`);
/** previousDocument：定义该变量以承载业务值。 */
    const previousDocument = this.options.getLoadedMap(mapId)?.source;
/** previousPersisted：定义该变量以承载业务值。 */
    const previousPersisted = previousDocument
      ? this.editableDomain.dehydrateEditableMapDocument(previousDocument)
      : null;
/** previousFileContent：定义该变量以承载业务值。 */
    const previousFileContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : null;

    try {
/** persisted：定义该变量以承载业务值。 */
      const persisted = this.editableDomain.dehydrateEditableMapDocument(normalized);
      fs.writeFileSync(filePath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf-8');
      await this.persistentDocumentService.save(MAP_DOCUMENT_SCOPE, mapId, persisted);
      this.options.loadMapIntoRuntime(normalized, previousDocument);
      this.options.afterDocumentMutation();
      return null;
    } catch (saveError) {
/** message：定义该变量以承载业务值。 */
      const message = saveError instanceof Error ? saveError.message : '地图保存失败';

      try {
        if (previousFileContent === null) {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } else {
          fs.writeFileSync(filePath, previousFileContent, 'utf-8');
        }
      } catch (rollbackError) {
/** rollbackMessage：定义该变量以承载业务值。 */
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.options.error(`地图文件回滚失败 ${mapId}: ${rollbackMessage}`);
      }

      try {
        if (previousPersisted) {
          await this.persistentDocumentService.save(MAP_DOCUMENT_SCOPE, mapId, previousPersisted);
        } else {
          await this.persistentDocumentService.delete(MAP_DOCUMENT_SCOPE, mapId);
        }
      } catch (rollbackError) {
/** rollbackMessage：定义该变量以承载业务值。 */
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.options.error(`地图静态镜像回滚失败 ${mapId}: ${rollbackMessage}`);
      }

      if (previousDocument) {
        try {
          this.options.loadMapIntoRuntime(previousDocument, previousDocument);
          this.options.afterDocumentMutation();
        } catch (rollbackError) {
/** rollbackMessage：定义该变量以承载业务值。 */
          const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          this.options.error(`地图内存回滚失败 ${mapId}: ${rollbackMessage}`);
        }
      }

      return message;
    }
  }

/** collectMapJsonFiles：执行对应的业务逻辑。 */
  private collectMapJsonFiles(dirPath: string): string[] {
/** entries：定义该变量以承载业务值。 */
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
/** files：定义该变量以承载业务值。 */
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.collectMapJsonFiles(entryPath));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(entryPath);
      }
    }
    return files;
  }

/** inferComposeGroupIdFromMapId：执行对应的业务逻辑。 */
  private inferComposeGroupIdFromMapId(mapId: string): string {
/** marker：定义该变量以承载业务值。 */
    const marker = mapId.lastIndexOf('_');
    if (marker <= 0) {
      return mapId;
    }
    return mapId.slice(0, marker);
  }
}

