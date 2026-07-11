/**
 * 炼丹与炼器目录的会话级缓存。
 *
 * 两类目录可能使用相同版本号，但内容不同；只有真正收到目录快照后，
 * 客户端才可以把该版本作为 knownCatalogVersion 回传给服务端。
 */
import type { AlchemyRecipeCatalogEntry } from '@mud/shared';

export type CraftCatalogKind = 'alchemy' | 'forging';

export type CraftCatalogSnapshot = {
  catalogVersion: number;
  catalog: AlchemyRecipeCatalogEntry[];
};

type StoredCraftCatalog = CraftCatalogSnapshot;

export class CraftCatalogCache {
  private readonly entries = new Map<CraftCatalogKind, StoredCraftCatalog>();

  /** 返回指定技艺当前可用的目录；未收到过快照时版本必须为 0。 */
  read(kind: CraftCatalogKind): CraftCatalogSnapshot {
    const stored = this.entries.get(kind);
    return stored ?? { catalogVersion: 0, catalog: [] };
  }

  /** 只有持有相同版本的真实目录快照时，才允许向服务端声明已知版本。 */
  getKnownVersion(kind: CraftCatalogKind): number | undefined {
    return this.entries.get(kind)?.catalogVersion;
  }

  /**
   * 合并面板回包中的目录信息。
   * 仅版本 patch 不会凭空建立缓存；若它宣告了新版本，则旧目录立即失效。
   */
  apply(
    kind: CraftCatalogKind,
    catalogVersion: unknown,
    catalog: readonly AlchemyRecipeCatalogEntry[] | undefined,
  ): CraftCatalogSnapshot {
    const normalizedVersion = normalizeCatalogVersion(catalogVersion);
    if (Array.isArray(catalog)) {
      const next = {
        catalogVersion: normalizedVersion,
        catalog: catalog.map(cloneCatalogEntry),
      };
      if (normalizedVersion > 0) {
        this.entries.set(kind, next);
      } else {
        this.entries.delete(kind);
      }
      return next;
    }

    const stored = this.entries.get(kind);
    if (!stored || stored.catalogVersion !== normalizedVersion) {
      this.entries.delete(kind);
      return { catalogVersion: 0, catalog: [] };
    }
    return stored;
  }

  clear(): void {
    this.entries.clear();
  }
}

function normalizeCatalogVersion(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function cloneCatalogEntry(entry: AlchemyRecipeCatalogEntry): AlchemyRecipeCatalogEntry {
  return {
    ...entry,
    mainIngredients: (entry.mainIngredients ?? []).map((ingredient) => ({ ...ingredient })),
    requiredAuxElements: entry.requiredAuxElements ? { ...entry.requiredAuxElements } : undefined,
    ingredients: entry.ingredients.map((ingredient) => ({ ...ingredient })),
  };
}
