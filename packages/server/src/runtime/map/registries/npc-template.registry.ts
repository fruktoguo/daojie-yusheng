import { Injectable } from '@nestjs/common';
import { deepFreezeTemplate } from '../../../content/registries/template-freeze';

@Injectable()
export class NpcTemplateRegistry {
  readonly npcTemplates = new Map<string, any>();
  readonly npcLocationById = new Map<string, any>();
  private readonly npcIdsByMapId = new Map<string, string[]>();

  loadAll(): void {
    this.npcTemplates.clear();
    this.npcLocationById.clear();
    this.npcIdsByMapId.clear();
  }

  registerMapTemplate(template: any): void {
    const mapId = String(template?.id ?? '').trim();
    if (!mapId) {
      return;
    }
    const ids: string[] = [];
    for (const npc of template.npcs ?? []) {
      const npcId = String(npc?.id ?? '').trim();
      if (!npcId) {
        continue;
      }
      const frozen = deepFreezeTemplate(npc);
      this.npcTemplates.set(npcId, frozen);
      ids.push(npcId);
      if (!this.npcLocationById.has(npcId)) {
        this.npcLocationById.set(npcId, deepFreezeTemplate({
          npcId,
          npcName: frozen.name,
          mapId,
          mapName: template.name,
          x: frozen.x,
          y: frozen.y,
        }));
      }
    }
    this.npcIdsByMapId.set(mapId, ids);
  }

  getRef(npcId: string): Readonly<any> {
    const template = this.tryGetRef(npcId);
    if (!template) {
      throw new Error(`未找到 NPC 模板：${npcId}`);
    }
    return template;
  }

  tryGetRef(npcId: string): Readonly<any> | undefined {
    return this.npcTemplates.get(String(npcId ?? '').trim());
  }

  getLocation(npcId: string): Readonly<any> | null {
    return this.npcLocationById.get(String(npcId ?? '').trim()) ?? null;
  }

  listInMap(mapId: string): readonly any[] {
    return (this.npcIdsByMapId.get(String(mapId ?? '').trim()) ?? [])
      .map((npcId) => this.npcTemplates.get(npcId))
      .filter(Boolean);
  }

  listShopItems(npcId: string): readonly any[] {
    return this.tryGetRef(npcId)?.shopItems ?? [];
  }

  listQuests(npcId: string): readonly any[] {
    return this.tryGetRef(npcId)?.quests ?? [];
  }

  listIds(): readonly string[] {
    return Array.from(this.npcTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }
}
