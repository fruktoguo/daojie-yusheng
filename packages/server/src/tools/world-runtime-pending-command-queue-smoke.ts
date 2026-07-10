import assert from 'node:assert/strict';

import { ConflictException, HttpException } from '@nestjs/common';

import { WorldRuntimePendingCommandService } from '../runtime/world/command/world-runtime-pending-command.service';

type RecordedCommand = { playerId: string; command: Record<string, unknown> };

function createDispatchDeps(recorded: RecordedCommand[]) {
  return {
    async dispatchInstanceCommand(playerId: string, command: Record<string, unknown>) {
      recorded.push({ playerId, command });
    },
    async dispatchPlayerCommand(playerId: string, command: Record<string, unknown>) {
      recorded.push({ playerId, command });
    },
    playerRuntimeService: {
      getPlayer() { return null; },
    },
    logger: {
      warn() {},
      debug() {},
    },
    queuePlayerNotice() {},
  };
}

async function verifyNonReplaceableCommandsUseFifo(): Promise<void> {
  const service = new WorldRuntimePendingCommandService();
  const recorded: RecordedCommand[] = [];
  const deps = createDispatchDeps(recorded);

  service.enqueuePendingCommand('player:1', { kind: 'takeGround', sourceId: 'ground:1', itemKey: 'item:1' });
  service.enqueuePendingCommand('player:1', { kind: 'dropItem', itemInstanceId: 'inventory:1', count: 1 });

  assert.equal(service.getPendingCommandCount(), 2);
  assert.equal(service.getPendingCommand('player:1')?.kind, 'takeGround');

  await service.dispatchPendingCommands(deps);
  assert.equal(service.getPendingCommandCount(), 1);
  assert.equal(service.getPendingCommand('player:1')?.kind, 'dropItem');

  await service.dispatchPendingCommands(deps);
  assert.equal(service.getPendingCommandCount(), 0);
  assert.deepEqual(recorded.map((entry) => entry.command.kind), ['takeGround', 'dropItem']);
}

function verifyReplaceableMovementUsesLastIntent(): void {
  const service = new WorldRuntimePendingCommandService();
  service.enqueuePendingCommand('player:1', { kind: 'move', direction: 'east' });
  service.enqueuePendingCommand('player:1', { kind: 'move', direction: 'west' });

  assert.equal(service.getPendingCommandCount(), 1);
  assert.equal(service.getPendingCommand('player:1')?.direction, 'west');
}

function verifyDuplicateAndCapacityRejectsAreExplicit(): void {
  const service = new WorldRuntimePendingCommandService();
  const duplicate = { kind: 'acceptNpcQuest', npcId: 'npc:1', questId: 'quest:1' };
  service.enqueuePendingCommand('player:1', duplicate);
  assert.throws(
    () => service.enqueuePendingCommand('player:1', { ...duplicate }),
    (error: unknown) => error instanceof ConflictException && error.message === '相同指令已在等待执行',
  );

  service.clearPendingCommand('player:1');
  for (let index = 0; index < 16; index += 1) {
    service.enqueuePendingCommand('player:1', {
      kind: 'dropItem',
      itemInstanceId: `inventory:${index}`,
      count: 1,
    });
  }
  assert.throws(
    () => service.enqueuePendingCommand('player:1', { kind: 'dropItem', itemInstanceId: 'inventory:overflow', count: 1 }),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
  );
  assert.equal(service.getPendingCommandCount(), 16);
}

async function verifyEnqueueDuringDispatchIsRetained(): Promise<void> {
  const service = new WorldRuntimePendingCommandService();
  let releaseDispatch: (() => void) | null = null;
  const dispatchedDirections: unknown[] = [];
  const deps = {
    async dispatchInstanceCommand(_playerId: string, command: Record<string, unknown>) {
      dispatchedDirections.push(command.direction);
      await new Promise<void>((resolve) => {
        releaseDispatch = resolve;
      });
    },
    async dispatchPlayerCommand() {},
    playerRuntimeService: { getPlayer() { return null; } },
    logger: { warn() {}, debug() {} },
    queuePlayerNotice() {},
  };

  service.enqueuePendingCommand('player:1', { kind: 'move', direction: 'east' });
  const dispatching = service.dispatchPendingCommands(deps);
  await new Promise<void>((resolve) => setImmediate(resolve));
  service.enqueuePendingCommand('player:1', { kind: 'move', direction: 'west' });
  releaseDispatch?.();
  await dispatching;

  assert.equal(service.getPendingCommandCount(), 1);
  assert.equal(service.getPendingCommand('player:1')?.direction, 'west');
  assert.deepEqual(dispatchedDirections, ['east']);
}

async function main(): Promise<void> {
  await verifyNonReplaceableCommandsUseFifo();
  verifyReplaceableMovementUsesLastIntent();
  verifyDuplicateAndCapacityRejectsAreExplicit();
  await verifyEnqueueDuringDispatchIsRetained();
  console.log(JSON.stringify({ ok: true, case: 'world-runtime-pending-command-queue' }));
}

void main();
