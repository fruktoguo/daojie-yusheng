import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyEquipmentAttributeEffectivenessToItemStack,
  CRAFT_EFFECT_KINDS,
  CRAFT_EFFECT_SKILL_KINDS,
  computeAlchemyAdjustedBrewTicks,
  computeAlchemyAdjustedSuccessRate,
  computeLuckSuccessRateBonus,
  computeEnhancementJobTicks,
  computeEnhancementAdjustedSuccessRate,
  computeEnhancementToolSpeedRate,
  getEquipmentAttributeEffectivenessBreakdown,
  getEquipmentRealmEffectiveness,
  getMiningDropRateBonus,
  getMiningDamageMultiplier,
  TileType,
  type CraftEffectStatsPatch,
} from '@mud/shared';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { CraftPanelAlchemyQueryService } from '../runtime/craft/craft-panel-alchemy-query.service';
import { CraftPanelEnhancementQueryService } from '../runtime/craft/craft-panel-enhancement-query.service';
import { PlayerAttributesService } from '../runtime/player/player-attributes.service';
import { resolveMiningAdjustedTileDamage, resolveMiningDropRateBonus } from '../runtime/world/combat/tile-drop.helpers';

const REMOVED_TOOL_STAT_FIELD_NAMES = [
  ['alchemy', 'Success', 'Rate'],
  ['alchemy', 'Speed', 'Rate'],
  ['forging', 'Success', 'Rate'],
  ['forging', 'Speed', 'Rate'],
  ['enhancement', 'Success', 'Rate'],
  ['enhancement', 'Speed', 'Rate'],
  ['mining', 'Damage', 'Rate'],
  ['mining', 'Drop', 'Rate'],
  ['building', 'Speed', 'Rate'],
].map((parts) => parts.join(''));

const TOOL_TAG_TO_SKILL_KIND = {
  alchemy_furnace: 'alchemy',
  forging_tool: 'forging',
  enhancement_hammer: 'enhancement',
  mining_pickaxe: 'mining',
  building_hammer: 'building',
} as const;

const TECHNIQUE_SLOT_TO_SKILL_KIND = {
  technique_alchemy: 'alchemy',
  technique_forging: 'forging',
  technique_enhancement: 'enhancement',
  technique_mining: 'mining',
  technique_building: 'building',
} as const;

function createRepository() {
  return {
    getItemName(itemId: string) {
      return itemId;
    },
    normalizeItem(item: Record<string, unknown>) {
      return { ...item };
    },
  };
}

function createPlayerRuntimeService() {
  return {
    playerProgressionService: {
      refreshPreview() {},
    },
    playerAttributesService: {
      recalculate() {},
    },
    canAffordWallet() {
      return true;
    },
    debitWallet() {},
    rebuildActionState() {},
    markPersistenceDirtyDomains() {},
    bumpPersistentRevision(player: { persistentRevision?: number }) {
      player.persistentRevision = Math.max(0, Number(player.persistentRevision) || 0) + 1;
    },
  };
}

function createService(): CraftPanelRuntimeService {
  const repository = createRepository();
  return new CraftPanelRuntimeService(
    repository as never,
    createPlayerRuntimeService() as never,
    { isEnabled: () => false } as never,
    new CraftPanelAlchemyQueryService(),
    new CraftPanelEnhancementQueryService(repository as never),
  );
}

function createTechniqueTool(
  itemId: string,
  tags: string[],
  craftEffectStats: CraftEffectStatsPatch,
) {
  const equipSlot = resolveTechniqueToolSlot(tags);
  return {
    itemId,
    name: itemId,
    type: 'equipment',
    count: 1,
    grade: 'yellow',
    level: 1,
    equipSlot,
    enhanceLevel: 10,
    tags,
    craftEffectStats,
  };
}

function resolveTechniqueToolSlot(tags: string[]): string {
  if (tags.includes('alchemy_furnace')) return 'technique_alchemy';
  if (tags.includes('forging_tool')) return 'technique_forging';
  if (tags.includes('enhancement_hammer')) return 'technique_enhancement';
  if (tags.includes('mining_pickaxe')) return 'technique_mining';
  if (tags.includes('building_hammer')) return 'technique_building';
  throw new Error(`unknown technique tool tags: ${tags.join(',')}`);
}

function createPlayer(weapon: ReturnType<typeof createTechniqueTool>) {
  const attrService = new PlayerAttributesService();
  return {
    playerId: 'player:technique-equipment-effectiveness',
    persistentRevision: 1,
    selfRevision: 1,
    luck: 0,
    realm: { realmLv: 1 },
    hp: 100,
    maxHp: 100,
    qi: 0,
    maxQi: 0,
    attrs: attrService.createInitialState(),
    wallet: { balances: [] },
    inventory: {
      revision: 1,
      capacity: 20,
      items: [
        {
          itemId: 'equip.test_blade',
          name: '测试剑',
          type: 'equipment',
          count: 1,
          grade: 'yellow',
          level: 1,
          equipSlot: 'weapon',
          enhanceLevel: 0,
          itemInstanceId: 'test-blade-instance',
        },
      ],
    },
    equipment: {
      slots: [
        { slot: 'weapon', item: null },
        { slot: weapon.equipSlot, item: weapon },
      ],
    },
    alchemySkill: { level: 1, exp: 0, expToNext: 60 },
    forgingSkill: { level: 1, exp: 0, expToNext: 60 },
    gatherSkill: { level: 1, exp: 0, expToNext: 60 },
    buildingSkill: { level: 1, exp: 0, expToNext: 60 },
    miningSkill: { level: 1, exp: 0, expToNext: 60 },
    enhancementSkill: { level: 1, exp: 0, expToNext: 60 },
    enhancementSkillLevel: 1,
    alchemyPresets: [],
    enhancementRecords: [],
    alchemyJob: null,
    forgingJob: null,
    enhancementJob: null,
  };
}

function recalculatePlayerCraftEffectStats(player: ReturnType<typeof createPlayer>) {
  const attrService = new PlayerAttributesService();
  attrService.recalculate(player as never);
  return player.attrs.craftEffectStats;
}

function testEnhancedHammerAffectsEnhancementPanelAndJob(): void {
  const service = createService();
  const hammer = createTechniqueTool('equip.test_hammer', ['enhancement_hammer'], {
    enhancement: { successRate: 0.1, speedRate: 0.5 },
  });
  const player = createPlayer(hammer);
  player.luck = 3;
  const craftEffectStats = recalculatePlayerCraftEffectStats(player);
  const effectiveHammer = applyEquipmentAttributeEffectivenessToItemStack(hammer as never, player.realm.realmLv);
  assert.equal(craftEffectStats.enhancement.successRate, effectiveHammer.craftEffectStats?.enhancement?.successRate);
  assert.equal(craftEffectStats.enhancement.speedRate, effectiveHammer.craftEffectStats?.enhancement?.speedRate);
  const expectedSuccessRate = computeEnhancementAdjustedSuccessRate(
    1,
    player.enhancementSkill.level,
    1,
    craftEffectStats.enhancement.successRate,
    computeLuckSuccessRateBonus(player.luck),
  );
  const expectedTicks = computeEnhancementJobTicks(
    1,
    computeEnhancementToolSpeedRate(craftEffectStats.enhancement.speedRate, player.enhancementSkill.level, 1),
  );

  const panel = service.buildEnhancementPanelPayload(player as never);
  assert.equal(panel.state.toolStats.enhancement?.successRate, craftEffectStats.enhancement.successRate);
  const candidate = panel.state.candidates.find((entry: any) => entry.item.itemId === 'equip.test_blade');
  assert.ok(candidate, 'expected enhancement candidate');
  assert.equal(candidate.successRate, expectedSuccessRate);
  assert.equal(candidate.durationTicks, expectedTicks);

  const result = service.startTechniqueActivity(player as never, 'enhancement', {
    target: { source: 'inventory', itemInstanceId: 'test-blade-instance' },
  } as never);
  assert.equal(result.ok, true);
  assert.equal(player.enhancementJob?.successRate, expectedSuccessRate);
  assert.equal(player.enhancementJob?.totalTicks, expectedTicks);
}

function testEquipmentRealmEffectivenessUsesExponentialPenalty(): void {
  const playerRealmLv = 1;
  const equipmentRealmLv = 11;
  const expectedMultiplier = 0.95 ** 10;
  const baseItem = {
    itemId: 'equip.test_high_realm_blade',
    name: '测试高境界剑',
    type: 'equipment',
    count: 1,
    grade: 'yellow',
    level: equipmentRealmLv,
    equipSlot: 'weapon',
    enhanceLevel: 0,
    equipAttrs: { constitution: 100 },
    equipStats: { physAtk: 100 },
    craftEffectStats: { enhancement: { speedRate: 1 } },
  };
  const effectiveItem = applyEquipmentAttributeEffectivenessToItemStack(baseItem as never, playerRealmLv);
  const breakdown = getEquipmentAttributeEffectivenessBreakdown(baseItem as never, playerRealmLv);
  assert.equal(getEquipmentRealmEffectiveness(playerRealmLv, equipmentRealmLv), expectedMultiplier);
  assert.equal(breakdown.realmGap, 10);
  assert.equal(breakdown.realmPercent, expectedMultiplier * 100);
  assert.equal(effectiveItem.equipAttrs?.constitution, Math.ceil((100 * expectedMultiplier - Number.EPSILON) * 100) / 100);
  assert.equal(effectiveItem.equipStats?.physAtk, Math.ceil((100 * expectedMultiplier - Number.EPSILON) * 100) / 100);
  assert.equal(effectiveItem.craftEffectStats?.enhancement?.speedRate, Math.ceil((1 * expectedMultiplier - Number.EPSILON) * 10_000) / 10_000);
}

function testEnhancedAlchemyAndForgingToolsAffectJobs(): void {
  const recipe = {
    recipeId: 'test.recipe',
    outputItemId: 'item.test',
    outputName: '测试产物',
    outputLevel: 1,
    outputCount: 1,
    category: 'special',
    baseBrewTicks: 10,
    fullPower: 1,
    ingredients: [],
  };
  for (const kind of ['alchemy', 'forging'] as const) {
    const service = createService();
    service.alchemyCatalog = [recipe];
    service.forgingCatalog = [recipe];
    const tool = createTechniqueTool(`equip.test_${kind}_tool`, [kind === 'forging' ? 'forging_tool' : 'alchemy_furnace'], {
      [kind]: { successRate: 0.1, speedRate: 0.5 },
    });
    const player = createPlayer(tool);
    player.luck = 4;
    const craftEffectStats = recalculatePlayerCraftEffectStats(player);
    const effectiveTool = applyEquipmentAttributeEffectivenessToItemStack(tool as never, player.realm.realmLv);
    const expectedToolSuccessRate = craftEffectStats[kind].successRate;
    const expectedToolSpeedRate = craftEffectStats[kind].speedRate;
    assert.equal(expectedToolSuccessRate, effectiveTool.craftEffectStats?.[kind]?.successRate);
    assert.equal(expectedToolSpeedRate, effectiveTool.craftEffectStats?.[kind]?.speedRate);
    const expectedTicks = computeAlchemyAdjustedBrewTicks(
      recipe.baseBrewTicks,
      recipe,
      [],
      recipe.outputLevel,
      1,
      expectedToolSpeedRate,
      1,
    );
    const result = service.startTechniqueActivity(player as never, kind, {
      recipeId: recipe.recipeId,
      ingredients: [],
      quantity: 1,
    } as never);
    assert.equal(result.ok, true);
    const job = kind === 'forging' ? player.forgingJob : player.alchemyJob;
    assert.ok(job, 'expected alchemy-like job');
    const expectedSuccessRate = computeAlchemyAdjustedSuccessRate(
      job.baseElementSuccessRate,
      recipe.outputLevel,
      1,
      expectedToolSuccessRate,
      computeLuckSuccessRateBonus(player.luck),
    );
    assert.equal(job?.batchBrewTicks, expectedTicks);
    assert.equal(job?.successRate, expectedSuccessRate);
  }
}

function testEnhancedMiningPickaxeAlreadyAffectsTileDamage(): void {
  const pickaxe = createTechniqueTool('equip.test_pickaxe', ['mining_pickaxe'], {
    mining: { speedRate: 0.5, outputRate: 0.15 },
  });
  const player = createPlayer(pickaxe);
  player.miningSkill.level = 7;
  player.luck = 5;
  const craftEffectStats = recalculatePlayerCraftEffectStats(player);
  const effectivePickaxe = applyEquipmentAttributeEffectivenessToItemStack(pickaxe as never, player.realm.realmLv);
  assert.equal(craftEffectStats.mining.speedRate, effectivePickaxe.craftEffectStats?.mining?.speedRate);
  assert.equal(craftEffectStats.mining.outputRate, effectivePickaxe.craftEffectStats?.mining?.outputRate);
  const result = resolveMiningAdjustedTileDamage({
    attacker: player,
    tileType: TileType.SpiritOre,
    baseDamage: 100,
  });
  assert.equal(result.isOreTile, true);
  assert.equal(
    result.damage,
    Math.round(100 * getMiningDamageMultiplier(player.miningSkill.level) * (1 + Number(craftEffectStats.mining.speedRate))),
  );
  assert.equal(
    resolveMiningDropRateBonus(player),
    getMiningDropRateBonus(player.miningSkill.level) + computeLuckSuccessRateBonus(player.luck),
  );
}

function testBuildingHammerProjectsHiddenCraftStats(): void {
  const hammer = createTechniqueTool('equip.test_building_hammer', ['building_hammer'], {
    building: { speedRate: 0.4 },
  });
  const player = createPlayer(hammer);
  const craftEffectStats = recalculatePlayerCraftEffectStats(player);
  const effectiveHammer = applyEquipmentAttributeEffectivenessToItemStack(hammer as never, player.realm.realmLv);
  assert.equal(craftEffectStats.building.speedRate, effectiveHammer.craftEffectStats?.building?.speedRate);
}

function findRepoRoot(): string {
  let current = process.cwd();
  for (let index = 0; index < 6; index += 1) {
    const packageJsonPath = path.join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson?.name === 'daojie-yusheng') {
          return current;
        }
      } catch {
        // 继续向上找仓库根。
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return process.cwd();
}

function walkJsonFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkJsonFiles(filePath));
    } else if (entry.name.endsWith('.json')) {
      result.push(filePath);
    }
  }
  return result;
}

function loadContentItems(): Array<Record<string, any>> {
  const itemsRoot = path.join(findRepoRoot(), 'packages/server/data/content/items');
  return walkJsonFiles(itemsRoot).flatMap((filePath) => {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.ok(Array.isArray(parsed), `item content file must be array: ${filePath}`);
    return parsed.map((item) => ({ ...item, __filePath: filePath }));
  });
}

function assertNoLegacyCraftEquipmentFields(value: unknown, location: string): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoLegacyCraftEquipmentFields(entry, `${location}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      REMOVED_TOOL_STAT_FIELD_NAMES.includes(key),
      false,
      `legacy craft equipment field ${key} remains at ${location}`,
    );
    assertNoLegacyCraftEquipmentFields(child, `${location}.${key}`);
  }
}

function resolveContentToolSkillKind(item: Record<string, any>): keyof typeof TECHNIQUE_SLOT_TO_SKILL_KIND | null {
  if (typeof item.equipSlot === 'string' && item.equipSlot in TECHNIQUE_SLOT_TO_SKILL_KIND) {
    return item.equipSlot as keyof typeof TECHNIQUE_SLOT_TO_SKILL_KIND;
  }
  for (const tag of item.tags ?? []) {
    if (typeof tag === 'string' && tag in TOOL_TAG_TO_SKILL_KIND) {
      const skillKind = TOOL_TAG_TO_SKILL_KIND[tag as keyof typeof TOOL_TAG_TO_SKILL_KIND];
      return `technique_${skillKind}` as keyof typeof TECHNIQUE_SLOT_TO_SKILL_KIND;
    }
  }
  return null;
}

function assertCraftEffectStatsPatch(stats: unknown, itemId: string, expectedSkillKind: string): void {
  assert.ok(stats && typeof stats === 'object' && !Array.isArray(stats), `${itemId} must define craftEffectStats`);
  const block = (stats as Record<string, unknown>)[expectedSkillKind];
  assert.ok(block && typeof block === 'object' && !Array.isArray(block), `${itemId} must define craftEffectStats.${expectedSkillKind}`);
  for (const skillKind of Object.keys(stats as Record<string, unknown>)) {
    assert.ok(CRAFT_EFFECT_SKILL_KINDS.includes(skillKind as never), `${itemId} has unknown craftEffectStats skill ${skillKind}`);
  }
  for (const effectKind of Object.keys(block as Record<string, unknown>)) {
    assert.ok(CRAFT_EFFECT_KINDS.includes(effectKind as never), `${itemId} has unknown craftEffectStats effect ${effectKind}`);
    assert.equal(typeof (block as Record<string, unknown>)[effectKind], 'number', `${itemId}.${expectedSkillKind}.${effectKind} must be number`);
  }
}

function testContentTechniqueToolsUseCraftEffectStatsOnly(): void {
  const items = loadContentItems();
  for (const item of items) {
    assertNoLegacyCraftEquipmentFields(item, item.itemId ?? item.__filePath);
  }

  const techniqueTools = items.filter((item) => resolveContentToolSkillKind(item));
  assert.ok(techniqueTools.length > 0, 'expected content technique tools');
  for (const item of techniqueTools) {
    const slot = resolveContentToolSkillKind(item);
    assert.ok(slot, `expected technique slot for ${item.itemId}`);
    const expectedSkillKind = TECHNIQUE_SLOT_TO_SKILL_KIND[slot];
    assertCraftEffectStatsPatch(item.craftEffectStats, item.itemId, expectedSkillKind);
  }
}

function testGeneratedEditorCatalogKeepsCraftEffectStats(): void {
  const repoRoot = findRepoRoot();
  const generatedCatalogPath = path.join(repoRoot, 'packages/client/src/constants/world/editor-catalog.generated.json');
  const generatedCatalog = JSON.parse(fs.readFileSync(generatedCatalogPath, 'utf8'));
  const generatedItems = new Map<string, Record<string, any>>(
    (generatedCatalog.items ?? []).map((item: Record<string, any>) => [String(item.itemId), item]),
  );
  for (const item of loadContentItems().filter((entry) => resolveContentToolSkillKind(entry))) {
    const generated = generatedItems.get(item.itemId);
    assert.ok(generated, `generated editor catalog missing ${item.itemId}`);
    assert.deepEqual(generated.craftEffectStats, item.craftEffectStats, `generated editor catalog lost craftEffectStats for ${item.itemId}`);
  }
}

function main(): void {
  testEnhancedHammerAffectsEnhancementPanelAndJob();
  testEquipmentRealmEffectivenessUsesExponentialPenalty();
  testEnhancedAlchemyAndForgingToolsAffectJobs();
  testEnhancedMiningPickaxeAlreadyAffectsTileDamage();
  testBuildingHammerProjectsHiddenCraftStats();
  testContentTechniqueToolsUseCraftEffectStatsOnly();
  testGeneratedEditorCatalogKeepsCraftEffectStats();
  console.log(JSON.stringify({ ok: true, case: 'technique-equipment-effectiveness' }, null, 2));
}

main();
