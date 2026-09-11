import { readFileSync } from 'node:fs';
import { PLANT_SEED_USE_BEHAVIOR } from '@mud/shared';
import { resolveProjectPath } from '../common/project-path';
import type { ItemTemplateRegistry } from './registries/item-template.registry';

export interface PlantDefinition {
  resourceNodeId: string;
  seedItemId: string;
  name: string;
  container: Record<string, any>;
}

/** 与地图共用资源节点真源，仅在内容加载期建立种子与采集物索引。 */
export class PlantingContent {
  readonly bySeedItemId = new Map<string, PlantDefinition>();
  readonly byResourceNodeId = new Map<string, PlantDefinition>();
  readonly byHarvestItemId = new Map<string, PlantDefinition>();

  load(items: ItemTemplateRegistry): void {
    this.bySeedItemId.clear();
    this.byResourceNodeId.clear();
    this.byHarvestItemId.clear();
    const raw = JSON.parse(readFileSync(resolveProjectPath('packages', 'server', 'data', 'content', 'resource-nodes.json'), 'utf8'));
    for (const node of raw.resourceNodes) {
      if (node.container?.variant !== 'herb') continue;
      const seed = items.tryGetRef(node.seedItemId);
      if (!seed || seed.useBehavior !== PLANT_SEED_USE_BEHAVIOR || this.bySeedItemId.has(node.seedItemId)) {
        throw new Error(`plant_seed_definition_invalid:${node.id}`);
      }
      const source = node.container;
      const drops = (source.drops ?? []).map((drop: Record<string, any>) => {
        if (!items.tryGetRef(drop.itemId)) throw new Error(`plant_harvest_item_missing:${drop.itemId}`);
        return { ...drop, chance: drop.chance ?? 1 };
      });
      if (!drops.length || (source.lootPools?.length ?? 0) > 0
        || !(source.refreshTicks > 0 || (source.refreshTicksMin > 0 && source.refreshTicksMax >= source.refreshTicksMin))) {
        throw new Error(`plant_growth_definition_invalid:${node.id}`);
      }
      const definition: PlantDefinition = {
        resourceNodeId: node.id, seedItemId: node.seedItemId, name: node.name,
        container: { ...source, resourceNodeId: node.id, name: node.name, drops, lootPools: [] },
      };
      this.bySeedItemId.set(node.seedItemId, definition);
      this.byResourceNodeId.set(node.id, definition);
      for (const drop of drops) {
        if (this.byHarvestItemId.has(drop.itemId)) throw new Error(`plant_harvest_source_ambiguous:${drop.itemId}`);
        this.byHarvestItemId.set(drop.itemId, definition);
      }
    }
  }

  resolve(container: Record<string, any>, harvestedItemId?: string): PlantDefinition | undefined {
    if (container.variant !== 'herb') return undefined;
    return this.byResourceNodeId.get(container.resourceNodeId)
      ?? this.byHarvestItemId.get(harvestedItemId ?? container.drops?.[0]?.itemId);
  }
}
