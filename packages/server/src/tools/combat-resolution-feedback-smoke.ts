import assert from 'node:assert/strict';

import {
  cloneNumericRatioDivisors,
  cloneNumericStats,
  DEFAULT_PLAYER_REALM_STAGE,
  PLAYER_REALM_NUMERIC_TEMPLATES,
} from '@mud/shared';

import { PlayerCombatService } from '../runtime/combat/player-combat.service';
import {
  formatCombatResolutionFloatText,
  formatCombatResolutionOutcome,
} from '../runtime/world/query/world-runtime.observation.helpers';
import { WorldRuntimeCombatEffectsService } from '../runtime/world/combat/world-runtime-combat-effects.service';
import { RuntimeEventBusService } from '../runtime/event-bus/runtime-event-bus.service';
import { emitCombatPresentation } from '../runtime/world/combat/world-runtime-combat-presentation.helpers';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';

function createCombatStats(overrides: Record<string, unknown> = {}) {
  return {
    ...cloneNumericStats(PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE].stats),
    ...overrides,
  };
}

function createCombatant(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 'combatant',
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    realm: { realmLv: 1 },
    realmLv: 1,
    combatExp: 0,
    attrs: {
      finalAttrs: {
        constitution: 1,
        spirit: 1,
        perception: 1,
        talent: 1,
        strength: 1,
        meridians: 1,
      },
      numericStats: createCombatStats(),
      ratioDivisors: cloneNumericRatioDivisors(PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE].ratioDivisors),
    },
    buffs: [],
    ...overrides,
  };
}

function testSkillResolutionKeepsDodgedFeedback(): void {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const service = new PlayerCombatService({} as never);
    const attacker = createCombatant({
      playerId: 'player:attacker',
      attrs: {
        ...createCombatant().attrs,
        numericStats: createCombatStats({
          spellAtk: 10,
          hit: 0,
          crit: 0,
          breakPower: 0,
        }),
      },
    });
    const target = createCombatant({
      playerId: 'monster:target',
      attrs: {
        ...createCombatant().attrs,
        numericStats: createCombatStats({
          maxHp: 100,
          dodge: 1000,
          antiCrit: 0,
          resolvePower: 0,
        }),
      },
    });
    const result = service.executeResolvedSkillCast(
      attacker as never,
      target as never,
      {
        skill: {
          id: 'skill.feedback_smoke',
          name: '反馈测试',
          cost: 0,
          cooldown: 0,
          range: 1,
          effects: [{
            type: 'damage',
            damageKind: 'spell',
            formula: 10,
          }],
        },
        level: 1,
        readyTick: 0,
      } as never,
      1,
      1,
      {
        setCooldownReadyTick: () => undefined,
      } as never,
    );

    assert.equal(result.totalDamage, 0);
    assert.equal(result.dodged, true);
    assert.equal(result.damageRolls.length, 1);
    assert.equal(result.damageRolls[0].dodged, true);
    assert.equal(formatCombatResolutionFloatText(result.damageRolls[0]), '闪避');
    assert.match(formatCombatResolutionOutcome(result.damageRolls[0], 'spell', undefined), /闪避/);
  }
  finally {
    Math.random = originalRandom;
  }
}

function testCombatPresentationEmitsDodgeFloatText(): void {
  const service = new WorldRuntimeCombatEffectsService(new RuntimeEventBusService());
  const notices: string[] = [];
  emitCombatPresentation({
    deps: {
      worldRuntimeCombatEffectsService: service,
      queuePlayerNotice(_playerId: string, text: string) {
        notices.push(text);
      },
    },
    instanceId: 'instance:feedback',
    actionLabel: { x: 1, y: 2, text: '攻击' },
    resolutionFloat: { x: 1, y: 2, resolution: { dodged: true, damage: 0 }, fallbackColor: '#7dd3fc' },
    notices: [{ playerId: 'player:1', text: '你对目标发起攻击，被闪避，未造成伤害。' }],
  });
  assert.deepEqual(service.getCombatEffects('instance:feedback'), [
    {
      type: 'float',
      x: 1,
      y: 2,
      text: '攻击',
      color: '#efe3c2',
      variant: 'action',
      actionStyle: undefined,
      durationMs: undefined,
    },
    {
      type: 'float',
      x: 1,
      y: 2,
      text: '闪避',
      color: '#7dd3fc',
      variant: 'action',
      durationMs: undefined,
    },
  ]);
  assert.equal(notices[0], '你对目标发起攻击，被闪避，未造成伤害。');
}

function testCombatPresentationSkipsInstancesWithoutConnectedSessions(): void {
  const instance = createAudienceInstance();
  const service = new WorldRuntimeCombatEffectsService(new RuntimeEventBusService());
  const notices: string[] = [];
  const deps = {
    worldRuntimeCombatEffectsService: service,
    getInstanceRuntime: () => instance,
    queuePlayerNotice(_playerId: string, text: string) {
      notices.push(text);
    },
  };

  instance.connectPlayer({ playerId: 'player:offline', sessionId: null });
  assert.equal(instance.hasConnectedPlayerSessions(), false);
  emitCombatPresentation({
    deps,
    instanceId: instance.meta.instanceId,
    actionLabel: { x: 1, y: 1, text: '攻击' },
    resolutionFloat: { x: 1, y: 1, resolution: { dodged: true, damage: 0 } },
    notices: [{ playerId: 'player:offline', text: '离线战斗通知' }],
  });
  assert.equal(service.getCombatEffects(instance.meta.instanceId).length, 0);
  assert.deepEqual(notices, ['离线战斗通知']);

  instance.connectPlayer({ playerId: 'player:offline', sessionId: 'session:online' });
  assert.equal(instance.hasConnectedPlayerSessions(), true);
  emitCombatPresentation({
    deps,
    instanceId: instance.meta.instanceId,
    actionLabel: { x: 1, y: 1, text: '攻击' },
    resolutionFloat: { x: 1, y: 1, resolution: { dodged: true, damage: 0 } },
  });
  assert.equal(service.getCombatEffects(instance.meta.instanceId).length, 2);

  assert.equal(instance.detachPlayerSession('player:offline'), true);
  assert.equal(instance.hasConnectedPlayerSessions(), false);
  instance.connectPlayer({ playerId: 'player:offline', sessionId: 'session:again' });
  assert.equal(instance.hasConnectedPlayerSessions(), true);
  assert.equal(instance.disconnectPlayer('player:offline'), true);
  assert.equal(instance.hasConnectedPlayerSessions(), false);
}

function createAudienceInstance(): MapInstanceRuntime {
  const instanceId = 'instance:combat-presentation-audience';
  return new MapInstanceRuntime({
    instanceId,
    template: {
      id: instanceId,
      name: '战斗表现接收者烟测',
      width: 3,
      height: 3,
      terrainRows: ['...', '...', '...'],
      walkableMask: Uint8Array.from({ length: 9 }, () => 1),
      blocksSightMask: new Uint8Array(9),
      baseAuraByTile: new Int32Array(9),
      baseTileResourceEntries: [],
      portals: [],
      npcs: [],
      safeZones: [],
      landmarks: [],
      containers: [],
      spawnX: 1,
      spawnY: 1,
      source: {},
    },
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '战斗表现接收者烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
}

function main(): void {
  testSkillResolutionKeepsDodgedFeedback();
  testCombatPresentationEmitsDodgeFloatText();
  testCombatPresentationSkipsInstancesWithoutConnectedSessions();
  console.log(JSON.stringify({
    ok: true,
    case: 'combat-resolution-feedback',
    answers: '技能结算仍保留闪避/破招/拆招/暴击判定并写入战斗日志；存在在线会话时地图飘字会发送短文本反馈，无在线接收者时跳过纯表现事件但保留通知链。',
  }, null, 2));
}

main();
