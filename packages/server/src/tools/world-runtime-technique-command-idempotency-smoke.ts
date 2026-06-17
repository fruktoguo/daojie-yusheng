import assert from 'node:assert/strict';

import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';
import { WorldRuntimePendingCommandService } from '../runtime/world/command/world-runtime-pending-command.service';

type RuntimePlayer = {
  playerId: string;
  hp: number;
  combat?: { pendingSkillCast?: unknown };
  transmissionJob?: {
    jobType?: string;
    techniqueId?: string;
    teacherPlayerId?: string;
    buildingId?: string;
    remainingTicks?: number;
    workRemainingTicks?: number;
  } | null;
};

type LogEntry = unknown[];

function createPlayerCommandService(players: Map<string, RuntimePlayer>, log: LogEntry[]): WorldRuntimePlayerCommandService {
  const playerRuntimeService = {
    getPlayer(playerId: string): RuntimePlayer | null {
      log.push(['getPlayer', playerId]);
      return players.get(playerId) ?? null;
    },
    getPlayerOrThrow(playerId: string): RuntimePlayer {
      log.push(['getPlayerOrThrow', playerId]);
      const player = players.get(playerId);
      if (!player) {
        throw new Error(`player ${playerId} not found`);
      }
      return player;
    },
  };
  return new WorldRuntimePlayerCommandService(
    playerRuntimeService,
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
  );
}

async function testDuplicateTransmissionStartIsIdempotent(): Promise<void> {
  const log: LogEntry[] = [];
  const players = new Map<string, RuntimePlayer>([
    ['teacher:1', { playerId: 'teacher:1', hp: 100, combat: {} }],
    ['learner:1', {
      playerId: 'learner:1',
      hp: 100,
      combat: {},
      transmissionJob: {
        jobType: 'transmission',
        techniqueId: 'gen_alpha',
        teacherPlayerId: 'teacher:1',
        remainingTicks: 20,
        workRemainingTicks: 20,
      },
    }],
  ]);
  const service = createPlayerCommandService(players, log);
  await service.dispatchPlayerCommand('teacher:1', {
    kind: 'startTechniqueTransmission',
    learnerPlayerId: 'learner:1',
    techniqueId: 'gen_alpha',
  }, {
    craftPanelRuntimeService: {
      startTechniqueActivity(): never {
        throw new Error('duplicate request should not reach pipeline');
      },
    },
    worldRuntimeCraftMutationService: {
      flushCraftMutation(): never {
        throw new Error('duplicate request should not flush mutation');
      },
    },
  });
  assert.deepEqual(log, [
    ['getPlayer', 'teacher:1'],
    ['getPlayer', 'learner:1'],
  ]);
}

async function testDifferentTransmissionStartStillReachesPipeline(): Promise<void> {
  const log: LogEntry[] = [];
  const players = new Map<string, RuntimePlayer>([
    ['teacher:1', { playerId: 'teacher:1', hp: 100, combat: {} }],
    ['learner:1', {
      playerId: 'learner:1',
      hp: 100,
      combat: {},
      transmissionJob: {
        jobType: 'transmission',
        techniqueId: 'gen_alpha',
        teacherPlayerId: 'teacher:1',
        remainingTicks: 20,
        workRemainingTicks: 20,
      },
    }],
  ]);
  const service = createPlayerCommandService(players, log);
  await assert.rejects(
    () => service.dispatchPlayerCommand('teacher:1', {
      kind: 'startTechniqueTransmission',
      learnerPlayerId: 'learner:1',
      techniqueId: 'gen_beta',
    }, {
      craftPanelRuntimeService: {
        startTechniqueActivity(player: RuntimePlayer, kind: string, payload: unknown): { ok: false; error: string; panelChanged: false; messages: [] } {
          log.push(['startTechniqueActivity', player.playerId, kind, payload]);
          return {
            ok: false,
            error: '学习者已有进行中的技艺任务。',
            panelChanged: false,
            messages: [],
          };
        },
      },
      worldRuntimeCraftMutationService: {
        flushCraftMutation(): never {
          throw new Error('failed mutation should not flush');
        },
      },
    }),
    /学习者已有进行中的技艺任务/,
  );
  assert.deepEqual(log, [
    ['getPlayer', 'teacher:1'],
    ['getPlayer', 'learner:1'],
    ['getPlayerOrThrow', 'learner:1'],
    ['startTechniqueActivity', 'learner:1', 'transmission', {
      learnerPlayerId: 'learner:1',
      teacherPlayerId: 'teacher:1',
      techniqueId: 'gen_beta',
    }],
  ]);
}

async function testTechniqueRejectLogsAtInfoLevel(): Promise<void> {
  const service = new WorldRuntimePendingCommandService();
  const log: LogEntry[] = [];
  service.enqueuePendingCommand('teacher:1', {
    kind: 'startTechniqueTransmission',
    learnerPlayerId: 'learner:1',
    techniqueId: 'gen_alpha',
  });
  await service.dispatchPendingCommands({
    dispatchInstanceCommand(): never {
      throw new Error('unexpected instance command');
    },
    dispatchPlayerCommand(): never {
      throw new Error('学习者已有进行中的技艺任务。');
    },
    logger: {
      log(message: string): void {
        log.push(['log', message]);
      },
      warn(message: string): void {
        log.push(['warn', message]);
      },
    },
    queuePlayerNotice(playerId: string, message: string, tone: string): void {
      log.push(['queuePlayerNotice', playerId, message, tone]);
    },
  });
  assert.deepEqual(log, [
    ['log', '处理玩家 teacher:1 的待执行指令失败：startTechniqueTransmission（学习者已有进行中的技艺任务。） debug=auto=0 manual=0 playerState=missing'],
    ['queuePlayerNotice', 'teacher:1', '学习者已有进行中的技艺任务。', 'warn'],
  ]);
}

async function testChantCombatRejectLogsAtInfoLevel(): Promise<void> {
  const service = new WorldRuntimePendingCommandService();
  const log: LogEntry[] = [];
  service.enqueuePendingCommand('player:1', {
    kind: 'engageBattle',
    targetPlayerId: null,
    targetMonsterId: 'monster:1',
    targetX: null,
    targetY: null,
  });
  await service.dispatchPendingCommands({
    dispatchInstanceCommand(): never {
      throw new Error('unexpected instance command');
    },
    dispatchPlayerCommand(): never {
      throw new Error('正在吟唱中，无法执行战斗动作。');
    },
    logger: {
      log(message: string): void {
        log.push(['log', message]);
      },
      warn(message: string): void {
        log.push(['warn', message]);
      },
    },
    queuePlayerNotice(playerId: string, message: string, tone: string): void {
      log.push(['queuePlayerNotice', playerId, message, tone]);
    },
  });
  assert.deepEqual(log, [
    ['log', '处理玩家 player:1 的待执行指令失败：engageBattle（正在吟唱中，无法执行战斗动作。） debug=auto=0 manual=0 playerState=missing'],
    ['queuePlayerNotice', 'player:1', '正在吟唱中，无法执行战斗动作。', 'warn'],
  ]);
}

async function main(): Promise<void> {
  await testDuplicateTransmissionStartIsIdempotent();
  await testDifferentTransmissionStartStillReachesPipeline();
  await testTechniqueRejectLogsAtInfoLevel();
  await testChantCombatRejectLogsAtInfoLevel();
  console.log('world-runtime-technique-command-idempotency-smoke passed');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
