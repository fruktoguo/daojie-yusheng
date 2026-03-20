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
  scaleTechniqueExp,
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

interface RawTechniqueLayerDef extends Omit<TechniqueLayerDef, 'expToNext'> {
  expToNext?: number;
  expFactor?: number;
}

interface RawTechniqueTemplate {
  id: string;
  name: string;
  grade: TechniqueGrade;
  layers: RawTechniqueLayerDef[];
  skills: RawSkillDef[];
}

type RealmSegmentId = 'martial' | 'immortal' | 'ascended';

export interface RealmLevelEntry {
  realmLv: number;
  displayName: string;
  name: string;
  phaseName: string | null;
  segment: RealmSegmentId;
  path: RealmSegmentId;
  grade: TechniqueGrade;
  gradeLabel: string;
  review: string;
}

interface RealmLevelBand {
  grade: TechniqueGrade;
  gradeLabel: string;
  levelFrom: number;
  levelTo: number;
}

interface RealmLevelSegment {
  id: RealmSegmentId;
  label: string;
  levelFrom: number;
  levelTo: number;
  rule: string;
}

interface RealmLevelsConfig {
  version: number;
  baseLevelKey: string;
  gradeSpan: number;
  immortalStageSpan: number;
  segments: RealmLevelSegment[];
  gradeBands: RealmLevelBand[];
  levels: RealmLevelEntry[];
}

const PLAYER_REALM_STAGE_LEVEL_RANGES: Record<PlayerRealmStage, { levelFrom: number; levelTo: number }> = {
  [PlayerRealmStage.Mortal]: { levelFrom: 1, levelTo: 5 },
  [PlayerRealmStage.BodyTempering]: { levelFrom: 6, levelTo: 8 },
  [PlayerRealmStage.BoneForging]: { levelFrom: 9, levelTo: 12 },
  [PlayerRealmStage.Meridian]: { levelFrom: 13, levelTo: 15 },
  [PlayerRealmStage.Innate]: { levelFrom: 16, levelTo: 18 },
  [PlayerRealmStage.QiRefining]: { levelFrom: 19, levelTo: 24 },
  [PlayerRealmStage.Foundation]: { levelFrom: 25, levelTo: 30 },
};

@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private readonly techniques = new Map<string, TechniqueTemplate>();
  private readonly items = new Map<string, ItemTemplate>();
  private realmLevelsConfig: RealmLevelsConfig | null = null;
  private readonly realmLevels = new Map<number, RealmLevelEntry>();
  private starterInventoryEntries: StarterInventoryEntry[] = [];
  private readonly contentDir = path.join(process.cwd(), 'data', 'content');
  private readonly techniquesDir = path.join(this.contentDir, 'techniques');
  private readonly itemsDir = path.join(this.contentDir, 'items');
  private readonly starterInventoryPath = path.join(this.contentDir, 'starter-inventory.json');
  private readonly realmLevelsPath = path.join(this.contentDir, 'realm-levels.json');

  onModuleInit(): void {
    this.loadContent();
  }

  private loadContent(): void {
    this.techniques.clear();
    this.items.clear();
    this.realmLevels.clear();
    this.loadTechniques();
    this.loadItems();
    this.loadStarterInventory();
    this.loadRealmLevels();
    this.logger.log(`内容已加载：功法 ${this.techniques.size} 条，物品 ${this.items.size} 条，境界 ${this.realmLevels.size} 条`);
  }

  private loadTechniques(): void {
    for (const raw of this.readJsonEntries<RawTechniqueTemplate>(this.techniquesDir)) {
      const technique: TechniqueTemplate = {
        id: raw.id,
        name: raw.name,
        grade: raw.grade,
        layers: [...(raw.layers ?? [])]
          .map((layer) => ({
            ...layer,
            expToNext: layer.expFactor === undefined
              ? Math.max(0, layer.expToNext ?? 0)
              : scaleTechniqueExp(layer.expFactor),
          }))
          .sort((left, right) => left.level - right.level),
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

  private loadRealmLevels(): void {
    const raw = JSON.parse(fs.readFileSync(this.realmLevelsPath, 'utf-8')) as RealmLevelsConfig;
    this.realmLevelsConfig = raw;
    for (const entry of raw.levels ?? []) {
      this.realmLevels.set(entry.realmLv, entry);
    }
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
      capacity: Math.max(DEFAULT_INVENTORY_CAPACITY, Number.isFinite(inventory.capacity) ? inventory.capacity : 0),
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

  getRealmLevelsConfig(): RealmLevelsConfig | null {
    return this.realmLevelsConfig;
  }

  getRealmLevelEntry(realmLv: number): RealmLevelEntry | undefined {
    return this.realmLevels.get(realmLv);
  }

  getRealmLevelRange(stage: PlayerRealmStage): { levelFrom: number; levelTo: number } {
    return PLAYER_REALM_STAGE_LEVEL_RANGES[stage] ?? PLAYER_REALM_STAGE_LEVEL_RANGES[PlayerRealmStage.Mortal];
  }

  getRealmStageStartEntry(stage: PlayerRealmStage): RealmLevelEntry | undefined {
    return this.getRealmLevelEntry(this.getRealmLevelRange(stage).levelFrom);
  }

  resolveRealmLevelEntry(
    stage: PlayerRealmStage,
    progress = 0,
    progressToNext = 0,
    breakthroughReady = false,
  ): RealmLevelEntry {
    const range = this.getRealmLevelRange(stage);
    const span = Math.max(1, range.levelTo - range.levelFrom + 1);
    let realmLv = range.levelFrom;

    if (span > 1) {
      if (breakthroughReady || progressToNext <= 0) {
        realmLv = range.levelTo;
      } else {
        const normalized = Math.max(0, Math.min(progress / progressToNext, 0.999999));
        realmLv = range.levelFrom + Math.min(span - 1, Math.floor(normalized * span));
      }
    }

    return this.realmLevels.get(realmLv)
      ?? this.realmLevels.get(range.levelFrom)
      ?? {
        realmLv: range.levelFrom,
        displayName: '未知境界',
        name: '未知境界',
        phaseName: null,
        segment: 'martial',
        path: 'martial',
        grade: 'mortal',
        gradeLabel: '凡阶',
        review: '',
      };
  }

  getSkill(skillId: string): SkillDef | undefined {
    for (const technique of this.techniques.values()) {
      const skill = technique.skills.find((entry) => entry.id === skillId);
      if (skill) return skill;
    }
    return undefined;
  }
}
