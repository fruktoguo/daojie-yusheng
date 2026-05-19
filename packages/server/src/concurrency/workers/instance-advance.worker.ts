/**
 * Instance Advance Worker 入口。
 * 在 worker_threads 中运行，处理实例级 tick 子阶段。
 * 持有分片实例的只读镜像，执行资源流动、阵法 tick、建筑 tick 等独立子阶段。
 * 不依赖 NestJS 容器。
 *
 * 可外移子阶段（仅这些进 worker）：
 * - 资源流动 / 阵法 tick / 建筑 tick（无跨实例依赖）
 * - 怪物 AI 决策（追击/巡逻/仇恨衰减/视线计算）
 * - 自动战斗预选目标
 *
 * 不可外移（主线程保留）：
 * - 玩家 session 进出实例
 * - 跨实例传送 / lease 切换 / fence
 * - 战斗结算应用
 * - 持久化写入
 */
import { parentPort } from 'node:worker_threads';

import type { WorkerTaskEnvelope, WorkerTaskResult } from '../worker-task.types';

if (!parentPort) {
  throw new Error('instance-advance.worker.ts must be run as a worker_threads Worker');
}

/** 实例镜像状态 */
interface InstanceMirror {
  instanceId: string;
  tick: number;
  /** 怪物状态快照 */
  monsters: MonsterMirror[];
  /** 资源流动状态 */
  resourceState: unknown;
  /** 建筑状态 */
  buildings: unknown[];
}

interface MonsterMirror {
  monsterId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  aggroTargetId: string | null;
  cooldownReadyTickBySkillId: Record<string, number>;
}

/** 实例 tick 子阶段结果 */
interface InstanceAdvanceOutput {
  instanceId: string;
  /** 怪物 AI 决策意图 */
  monsterIntents: MonsterIntent[];
  /** 资源流动变更 */
  resourceMutations: unknown[];
  /** 建筑进度变更 */
  buildingMutations: unknown[];
}

interface MonsterIntent {
  monsterId: string;
  action: 'move' | 'attack' | 'skill' | 'idle' | 'return';
  targetX?: number;
  targetY?: number;
  targetId?: string;
  skillId?: string;
}

parentPort.on('message', (envelope: WorkerTaskEnvelope) => {
  const startedAt = performance.now();
  try {
    const result = handleTask(envelope);
    const response: WorkerTaskResult = {
      taskId: envelope.taskId,
      ok: true,
      result,
      durationMs: performance.now() - startedAt,
    };
    parentPort!.postMessage(response);
  } catch (err: unknown) {
    const response: WorkerTaskResult = {
      taskId: envelope.taskId,
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - startedAt,
    };
    parentPort!.postMessage(response);
  }
});

function handleTask(envelope: WorkerTaskEnvelope): unknown {
  switch (envelope.kind) {
    case 'instance-advance':
      return handleInstanceAdvance(envelope.payload);
    default:
      throw new Error(`Unknown task kind: ${envelope.kind}`);
  }
}

function handleInstanceAdvance(payload: unknown): InstanceAdvanceOutput {
  const input = payload as { instanceId: string; tick: number; mirror: InstanceMirror };
  const { instanceId, tick, mirror } = input;

  // 怪物 AI 决策
  const monsterIntents = computeMonsterIntents(mirror?.monsters ?? [], tick);

  return {
    instanceId,
    monsterIntents,
    resourceMutations: [],
    buildingMutations: [],
  };
}

/** 基于只读镜像生成确定性的怪物意图预案；权威应用仍在主线程完成。 */
function computeMonsterIntents(monsters: MonsterMirror[], _tick: number): MonsterIntent[] {
  const intents: MonsterIntent[] = [];
  for (const monster of monsters) {
    if (!monster.alive) continue;
    if (monster.aggroTargetId) {
      intents.push({
        monsterId: monster.monsterId,
        action: 'attack',
        targetId: monster.aggroTargetId,
      });
    } else {
      intents.push({
        monsterId: monster.monsterId,
        action: 'idle',
      });
    }
  }
  return intents;
}

