import assert from 'node:assert/strict';

import { PlayerProgressionService } from '../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

interface SmokeTechnique {
  techId: string;
  name: string;
  level: number;
  exp: number;
  expToNext: number;
  realmLv: number;
  skills: Array<Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
}

interface SmokePendingTechnique {
  techId: string;
  name: string;
  sourceKind: string;
  selfComprehensionAllowed: boolean;
  progress: number;
  requiredProgress: number;
  realmLv: number;
  grade: string;
  category: string;
  createdAtTick: number;
  updatedAtTick: number;
  activeTransferJob: null;
}

interface SmokePlayer {
  playerId: string;
  foundation: number;
  combatExp: number;
  persistentRevision: number;
  realm: Record<string, unknown>;
  heavenGate: null;
  spiritualRoots: null;
  lifespanYears: null;
  bodyTraining: { level: number; exp: number; expToNext: number };
  techniques: {
    revision: number;
    techniques: SmokeTechnique[];
    cultivatingTechId: string | null;
  };
  pendingTechniqueComprehensions: SmokePendingTechnique[];
  transmissionJob: null;
  combat: {
    cultivationActive: boolean;
    autoSwitchCultivation: boolean;
    autoBattleSkills: unknown[];
  };
  attrs: {
    numericStats: {
      realmExpPerTick: number;
      techniqueExpPerTick: number;
      playerExpRate: number;
      techniqueExpRate: number;
    };
  };
  dirtyDomains: Set<string>;
}

const contentTemplateRepository = {
  getItemName(itemId: string) {
    return itemId;
  },
  getRealmLevel() {
    return null;
  },
  getBreakthroughForRealmLevel() {
    return null;
  },
};

const playerAttributesService = {
  recalculate() {
    return false;
  },
  markPanelDirty() {},
};

function createProgressionService(): PlayerProgressionService {
  const service = new PlayerProgressionService(
    contentTemplateRepository as never,
    playerAttributesService as never,
    null,
  );
  service.onModuleInit();
  return service;
}

function createPlayer(playerId: string, technique: SmokeTechnique): SmokePlayer {
  return {
    playerId,
    foundation: 0,
    combatExp: 0,
    persistentRevision: 0,
    realm: {
      stage: '炼气',
      realmLv: 1,
      progress: 0,
      progressToNext: 100,
      breakthroughReady: false,
      breakthroughItems: [],
      minTechniqueLevel: 1,
      minTechniqueRealm: 1,
    },
    heavenGate: null,
    spiritualRoots: null,
    lifespanYears: null,
    bodyTraining: { level: 0, exp: 0, expToNext: 10_000 },
    techniques: {
      revision: 0,
      techniques: [technique],
      cultivatingTechId: technique.techId,
    },
    pendingTechniqueComprehensions: [],
    transmissionJob: null,
    combat: {
      cultivationActive: true,
      autoSwitchCultivation: false,
      autoBattleSkills: [],
    },
    attrs: {
      numericStats: {
        realmExpPerTick: 0,
        techniqueExpPerTick: 5,
        playerExpRate: 0,
        techniqueExpRate: 0,
      },
    },
    dirtyDomains: new Set<string>(),
  };
}

function clearMainTechnique(player: SmokePlayer): void {
  PlayerRuntimeService.prototype.cultivateTechnique.call({
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, player.playerId);
      return player;
    },
    bumpPersistentRevision(target: typeof player) {
      target.persistentRevision += 1;
    },
  }, player.playerId, null);
}

function testCancelledFiniteAndUnlimitedTechniquesRouteExperienceToBodyTraining(): void {
  const cases = [
    {
      kind: 'finite',
      technique: {
        techId: 'smoke.finite',
        name: '有限功法',
        level: 1,
        exp: 0,
        expToNext: 100,
        realmLv: 1,
        skills: [],
        layers: [
          { level: 1, expToNext: 100 },
          { level: 2, expToNext: 0 },
        ],
      },
    },
    {
      kind: 'unlimited',
      technique: {
        techId: 'smoke.unlimited',
        name: '无限功法',
        level: 1,
        exp: 0,
        expToNext: 100,
        realmLv: 1,
        skills: [{
          id: 'smoke.unlimited.passive',
          active: false,
          passiveEffects: [{ type: 'buff', attrs: { constitution: 1 }, statMode: 'percent' }],
        }],
        layers: [{ level: 1, expToNext: 100 }],
      },
    },
  ];

  for (const entry of cases) {
    const progression = createProgressionService();
    const player = createPlayer(`player:${entry.kind}`, entry.technique);

    clearMainTechnique(player);
    const result = progression.advanceCultivation(player, 1);

    assert.equal(player.techniques.cultivatingTechId, null);
    assert.equal(player.combat.cultivationActive, true);
    assert.equal(player.bodyTraining.exp, 5);
    assert.ok(result.dirtyDomains.includes('body_training'));
  }
}

function testAutoSwitchPrefersFiniteTargetsBeforeUnlimitedTechnique(): void {
  const progression = createProgressionService();
  const finiteLayers = [
    { level: 1, expToNext: 100, attrs: {} },
    { level: 2, expToNext: 0, attrs: {} },
  ];
  const current = {
    techId: 'smoke.current.maxed',
    name: '当前圆满功法',
    level: 2,
    exp: 0,
    expToNext: 0,
    realmLv: 1,
    skills: [],
    layers: finiteLayers,
  };
  const unlimited = {
    techId: 'smoke.unlimited.target',
    name: '无限目标功法',
    level: 1,
    exp: 0,
    expToNext: 100,
    realmLv: 1,
    skills: [{
      id: 'smoke.unlimited.target.passive',
      active: false,
      passiveEffects: [{ type: 'buff', attrs: { spirit: 1 }, statMode: 'percent' }],
    }],
    layers: [{ level: 1, expToNext: 100, attrs: {} }],
  };
  const finite = {
    techId: 'smoke.finite.target',
    name: '有限目标功法',
    level: 1,
    exp: 0,
    expToNext: 100,
    realmLv: 1,
    skills: [],
    layers: finiteLayers,
  };
  const pending = {
    techId: 'smoke.pending.target',
    name: '待领悟有限功法',
    sourceKind: 'created',
    selfComprehensionAllowed: true,
    progress: 0,
    requiredProgress: 100,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  };
  const player = createPlayer('player:auto-switch', current);
  player.techniques.techniques = [current, unlimited, finite];
  player.pendingTechniqueComprehensions = [pending];
  player.combat.autoSwitchCultivation = true;

  const finiteSwitch = progression.resolveActiveCultivatingTechnique(player);
  assert.equal(player.techniques.cultivatingTechId, finite.techId);
  assert.equal(finiteSwitch.technique?.techId, finite.techId);

  finite.level = 2;
  finite.expToNext = 0;
  player.techniques.revision += 1;
  player.techniques.cultivatingTechId = current.techId;
  const pendingSwitch = progression.resolveActiveCultivatingTechnique(player);
  assert.equal(player.techniques.cultivatingTechId, pending.techId);
  assert.equal(pendingSwitch.technique, null);

  pending.progress = pending.requiredProgress;
  player.techniques.cultivatingTechId = current.techId;
  assert.equal(progression.areAllTechniquesMaxed(player), false);
  const unlimitedSwitch = progression.resolveActiveCultivatingTechnique(player);
  assert.equal(player.techniques.cultivatingTechId, unlimited.techId);
  assert.equal(unlimitedSwitch.technique?.techId, unlimited.techId);
}

testCancelledFiniteAndUnlimitedTechniquesRouteExperienceToBodyTraining();
testAutoSwitchPrefersFiniteTargetsBeforeUnlimitedTechnique();

console.log(JSON.stringify({ ok: true, case: 'technique-cultivation-target' }, null, 2));
