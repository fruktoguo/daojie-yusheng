import type { DurableContainerStateSourceMutation } from './loot-source-durable-persistence';

export function assertPlantSeedSourceMutation(
  mutation: DurableContainerStateSourceMutation, playerId: string, inventoryAction: string,
  consumed: Array<{ itemId: string; count: number }>,
): void {
  const planted = mutation.statePayload.plantedHerb as Record<string, any> | undefined;
  const container = planted?.container;
  if (inventoryAction !== 'remove' || !planted || planted.ownerPlayerId !== playerId
    || consumed.length !== 1 || consumed[0].count !== 1 || consumed[0].itemId !== planted.seedItemId
    || !planted.farmlandBuildingId || !Number.isSafeInteger(planted.expiresAtTick) || planted.expiresAtTick <= 0
    || !container || container.id !== mutation.containerId || container.variant !== 'herb'
    || !Number.isSafeInteger(container.x) || !Number.isSafeInteger(container.y)
    || mutation.statePayload.sourceId !== mutation.sourceId
    || mutation.statePayload.containerId !== mutation.containerId) {
    throw new Error('plant_seed_source_mismatch');
  }
}
