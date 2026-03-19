import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_INVENTORY_CAPACITY,
  EquipmentSlots,
  EQUIP_SLOTS,
  Inventory,
  ItemStack,
  PlayerRealmStage,
  SkillDef,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueRealm,
  resolveSkillUnlockLevel,
} from '@mud/shared';

interface TechniqueTemplate {
  id: string;
  name: string;
  skills: SkillDef[];
  grade: TechniqueGrade;
  layers: TechniqueLayerDef[];
}

interface ItemTemplate extends Omit<ItemStack, 'count'> {
  learnTechniqueId?: string;
  healAmount?: number;
}

interface StarterInventoryEntry {
  itemId: string;
  count?: number;
}

interface RawSkillDef extends Omit<SkillDef, 'unlockRealm' | 'unlockPlayerRealm'> {
  unlockRealm?: keyof typeof TechniqueRealm | TechniqueRealm;
  unlockPlayerRealm?: keyof typeof PlayerRealmStage | PlayerRealmStage;
}

interface RawTechniqueTemplate {
  id: string;
  name: string;
  grade: TechniqueGrade;
  layers: TechniqueLayerDef[];
  skills: RawSkillDef[];
}

@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private readonly techniques = new Map<string, TechniqueTemplate>();
  private readonly items = new Map<string, ItemTemplate>();
  private starterInventoryEntries: StarterInventoryEntry[] = [];
  private readonly contentDir = path.join(process.cwd(), 'data', 'content');
  private readonly techniquesDir = path.join(this.contentDir, 'techniques');
  private readonly itemsDir = path.join(this.contentDir, 'items');
  private readonly starterInventoryPath = path.join(this.contentDir, 'starter-inventory.json');

  onModuleInit(): void {
    this.loadContent();
  }

  private loadContent(): void {
    this.techniques.clear();
    this.items.clear();
    this.loadTechniques();
    this.loadItems();
    this.loadStarterInventory();
    this.logger.log(`内容已加载：功法 ${this.techniques.size} 条，物品 ${this.items.size} 条`);
  }

  private loadTechniques(): void {
    for (const raw of this.readJsonEntries<RawTechniqueTemplate>(this.techniquesDir)) {
      const technique: TechniqueTemplate = {
        id: raw.id,
        name: raw.name,
        grade: raw.grade,
        layers: [...(raw.layers ?? [])].sort((left, right) => left.level - right.level),
        skills: raw.skills.map((skill) => ({
          ...skill,
          unlockLevel: resolveSkillUnlockLevel({
            unlockLevel: skill.unlockLevel,
            unlockRealm: skill.unlockRealm === undefined ? undefined : this.parseTechniqueRealm(skill.unlockRealm),
          }),
          unlockRealm: skill.unlockRealm === undefined ? undefined : this.parseTechniqueRealm(skill.unlockRealm),
          unlockPlayerRealm: skill.unlockPlayerRealm === undefined
            ? undefined
            : this.parsePlayerRealmStage(skill.unlockPlayerRealm),
        })),
      };
      this.techniques.set(technique.id, technique);
    }
  }

  private loadItems(): void {
    for (const item of this.readJsonEntries<ItemTemplate>(this.itemsDir)) {
      this.items.set(item.itemId, item);
    }
  }

  private loadStarterInventory(): void {
    const raw = JSON.parse(fs.readFileSync(this.starterInventoryPath, 'utf-8')) as { items?: StarterInventoryEntry[] };
    this.starterInventoryEntries = Array.isArray(raw.items) ? raw.items : [];
  }

  private readJsonEntries<T>(dirPath: string): T[] {
    const files = fs.readdirSync(dirPath).filter((file) => file.endsWith('.json')).sort();
    const result: T[] = [];
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
      result.push(...raw);
    }
    return result;
  }

  private parseTechniqueRealm(value: keyof typeof TechniqueRealm | TechniqueRealm): TechniqueRealm {
    if (typeof value === 'number') {
      return value;
    }
    return TechniqueRealm[value];
  }

  private parsePlayerRealmStage(value: keyof typeof PlayerRealmStage | PlayerRealmStage): PlayerRealmStage {
    if (typeof value === 'number') {
      return value;
    }
    return PlayerRealmStage[value];
  }

  getStarterInventory(): Inventory {
    return {
      capacity: DEFAULT_INVENTORY_CAPACITY,
      items: this.starterInventoryEntries
        .map((entry) => this.createItem(entry.itemId, entry.count ?? 1))
        .filter((item): item is ItemStack => item !== null),
    };
  }

  createItem(itemId: string, count = 1): ItemStack | null {
    const item = this.items.get(itemId);
    if (!item) return null;
    return {
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      count,
      desc: item.desc,
      equipSlot: item.equipSlot,
      equipAttrs: item.equipAttrs,
      equipStats: item.equipStats,
    };
  }

  normalizeItemStack(item: ItemStack): ItemStack {
    const normalized = this.createItem(item.itemId, item.count);
    if (!normalized) {
      return { ...item };
    }
    return normalized;
  }

  normalizeInventory(inventory: Inventory): Inventory {
    return {
      capacity: inventory.capacity,
      items: inventory.items.map((item) => this.normalizeItemStack(item)),
    };
  }

  normalizeEquipment(equipment: EquipmentSlots): EquipmentSlots {
    const normalized = { weapon: null, head: null, body: null, legs: null, accessory: null } as EquipmentSlots;
    for (const slot of EQUIP_SLOTS) {
      const item = equipment[slot];
      normalized[slot] = item ? this.normalizeItemStack(item) : null;
    }
    return normalized;
  }

  getItem(itemId: string): ItemTemplate | undefined {
    return this.items.get(itemId);
  }

  getTechnique(techniqueId: string): TechniqueTemplate | undefined {
    return this.techniques.get(techniqueId);
  }

  getSkill(skillId: string): SkillDef | undefined {
    for (const technique of this.techniques.values()) {
      const skill = technique.skills.find((entry) => entry.id === skillId);
      if (skill) return skill;
    }
    return undefined;
  }
}
