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

type EditableMapCatalogMeta = Pick<GmMapSummary, 'catalogMode' | 'catalogGroupId' | 'catalogGroupName' | 'sourcePath'>;

interface MapDocumentDomainOptions {
  mapsDir: string;
  getLoadedMaps: () => Iterable<MapData>;
  getLoadedMap: (mapId: string) => MapData | undefined;
  loadMapIntoRuntime: (document: GmMapDocument, previousDocument?: GmMapDocument) => void;
  afterDocumentMutation: () => void;
  log: (message: string) => void;
  error: (message: string) => void;
}

export class MapDocumentDomain {
  constructor(
    private readonly persistentDocumentService: PersistentDocumentService,
    private readonly editableDomain: MapEditableDomain,
    private readonly options: MapDocumentDomainOptions,
  ) {}

  async syncMapDocumentsFromFiles(): Promise<SyncedMapDocument[]> {
    const persistedDocuments = await this.persistentDocumentService.getScope<unknown>(MAP_DOCUMENT_SCOPE);
    const persistedByMapId = new Map<string, GmMapDocument>(
      persistedDocuments.map((entry) => [entry.key, this.editableDomain.normalizeEditableMapDocument(entry.payload)]),
    );

    const files = this.collectMapJsonFiles(this.options.mapsDir);

    const synced: SyncedMapDocument[] = [];
    const fileMapIds = new Set<string>();
    let createdCount = 0;
    let updatedCount = 0;

    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const normalized = this.editableDomain.normalizeEditableMapDocument(raw);
        const nextPayload = this.editableDomain.dehydrateEditableMapDocument(normalized);
        const previousDocument = persistedByMapId.get(normalized.id);
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
        const message = error instanceof Error ? error.message : String(error);
        this.options.error(`地图同步失败 ${file}: ${message}`);
      }
    }

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

  buildEditableMapCatalogMetaById(): Map<string, EditableMapCatalogMeta> {
    const result = new Map<string, EditableMapCatalogMeta>();
    const files = this.collectMapJsonFiles(this.options.mapsDir);
    for (const filePath of files) {
      const relativePath = path.relative(this.options.mapsDir, filePath).replace(/\\/g, '/');
      const mapId = path.basename(filePath, '.json');
      if (relativePath.startsWith('compose/')) {
        const segments = relativePath.split('/');
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

  getEditableMapList(): GmMapListRes {
    const baseList = buildEditableMapListResult([...this.options.getLoadedMaps()].map((map) => map.source));
    const catalogMetaById = this.buildEditableMapCatalogMetaById();
    return {
      maps: baseList.maps.map((summary) => ({
        ...summary,
        ...catalogMetaById.get(summary.id),
      })),
    };
  }

  getEditableMap(mapId: string): GmMapDocument | undefined {
    const map = this.options.getLoadedMap(mapId);
    if (!map) {
      return undefined;
    }
    return this.editableDomain.cloneMapDocument(map.source);
  }

  async saveEditableMap(mapId: string, document: GmMapDocument): Promise<string | null> {
    if (mapId !== document.id) {
      return '地图 ID 不允许在编辑器中直接修改';
    }

    const normalized = this.editableDomain.normalizeEditableMapDocument(document);
    const error = this.editableDomain.validateEditableMapDocument(normalized);
    if (error) {
      return error;
    }

    const filePath = path.join(this.options.mapsDir, `${mapId}.json`);
    const previousDocument = this.options.getLoadedMap(mapId)?.source;
    const previousPersisted = previousDocument
      ? this.editableDomain.dehydrateEditableMapDocument(previousDocument)
      : null;
    const previousFileContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : null;

    try {
      const persisted = this.editableDomain.dehydrateEditableMapDocument(normalized);
      fs.writeFileSync(filePath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf-8');
      await this.persistentDocumentService.save(MAP_DOCUMENT_SCOPE, mapId, persisted);
      this.options.loadMapIntoRuntime(normalized, previousDocument);
      this.options.afterDocumentMutation();
      return null;
    } catch (saveError) {
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
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        this.options.error(`地图静态镜像回滚失败 ${mapId}: ${rollbackMessage}`);
      }

      if (previousDocument) {
        try {
          this.options.loadMapIntoRuntime(previousDocument, previousDocument);
          this.options.afterDocumentMutation();
        } catch (rollbackError) {
          const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          this.options.error(`地图内存回滚失败 ${mapId}: ${rollbackMessage}`);
        }
      }

      return message;
    }
  }

  private collectMapJsonFiles(dirPath: string): string[] {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
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

  private inferComposeGroupIdFromMapId(mapId: string): string {
    const marker = mapId.lastIndexOf('_');
    if (marker <= 0) {
      return mapId;
    }
    return mapId.slice(0, marker);
  }
}

