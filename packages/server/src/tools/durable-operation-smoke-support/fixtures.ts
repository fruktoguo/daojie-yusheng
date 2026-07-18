import type { Pool, PoolClient } from 'pg';

import type { PersistedPlayerSnapshot } from '../../persistence/player-persistence.service';

export async function rollbackAndThrow(
  client: Pick<PoolClient, 'query'>,
  error: unknown,
): Promise<never> {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    throw new AggregateError(
      [error, rollbackError],
      'durable-operation smoke 事务执行和回滚均失败',
    );
  }
  throw error;
}

export async function seedClaimFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    mailId: string;
    attachmentId: string;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_mail(
          mail_id,
          player_id,
          sender_type,
          sender_label,
          mail_type,
          title,
          body,
          metadata_jsonb,
          mail_version,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'system', 'system', 'system', $3, $4, '{}'::jsonb, 1, $5, now())
      `,
      [input.mailId, input.playerId, 'durable smoke', 'durable smoke body', input.now],
    );
    await client.query(
      `
        INSERT INTO player_mail_attachment(
          attachment_id,
          mail_id,
          player_id,
          attachment_kind,
          item_id,
          count,
          item_payload_jsonb,
          created_at
        )
        VALUES ($1, $2, $3, 'item', 'spirit_stone', 1, $4::jsonb, now())
      `,
      [input.attachmentId, input.mailId, input.playerId, JSON.stringify({ itemId: 'spirit_stone', count: 1 })],
    );
    await client.query(
      `
        INSERT INTO server_player_snapshot(
          player_id,
          template_id,
          instance_id,
          persisted_source,
          saved_at,
          updated_at,
          payload
        )
        VALUES ($1, 'yunlai_town', 'public:yunlai_town', 'native', $2, now(), $3::jsonb)
      `,
      [input.playerId, input.now, JSON.stringify(buildNextSnapshot(input.now))],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export async function seedMarketClaimFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, 0, 'spirit_stone', 2, $3::jsonb, now())
      `,
      [
        `inventory:${input.playerId}:0`,
        input.playerId,
        JSON.stringify({ itemId: 'spirit_stone', count: 2 }),
      ],
    );
    await client.query(
      `
        INSERT INTO player_market_storage_item(
          storage_item_id,
          player_id,
          slot_index,
          item_id,
          count,
          enhance_level,
          raw_payload,
          updated_at
        )
        VALUES
          ($1, $2, 0, 'spirit_stone', 7, NULL, $3::jsonb, now()),
          ($4, $2, 1, 'moon_herb', 4, NULL, $5::jsonb, now())
      `,
      [
        `storage:${input.playerId}:0`,
        input.playerId,
        JSON.stringify({ itemId: 'spirit_stone', count: 7 }),
        `storage:${input.playerId}:1`,
        JSON.stringify({ itemId: 'moon_herb', count: 4 }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export async function seedNpcShopFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  return seedNpcShopFixtureImpl(pool, input);
}

export async function seedPlayerWalletFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
    walletBalance: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', $2, 0, 1, now())
      `,
      [input.playerId, Math.max(0, Math.trunc(Number(input.walletBalance ?? 0)))],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export function buildNpcShopInventoryItems() {
  return buildNpcShopInventoryItemsImpl();
}

export function buildNpcShopWalletBalances() {
  return buildNpcShopWalletBalancesImpl();
}

export function buildWalletMutationBalances(balance: number) {
  return [
    {
      walletType: 'spirit_stone',
      balance: Math.max(0, Math.trunc(Number(balance ?? 0))),
      frozenBalance: 0,
      version: 2,
    },
  ];
}

export async function seedMarketBuyNowFixture(
  pool: Pool,
  input: {
    buyerId: string;
    buyerRuntimeOwnerId: string;
    buyerSessionEpoch: number;
    sellerId: string;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.buyerId, true, true, input.now, input.buyerRuntimeOwnerId, input.buyerSessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES
          ($1, 'spirit_stone', 20, 0, 1, now()),
          ($2, 'spirit_stone', 3, 0, 1, now())
      `,
      [input.buyerId, input.sellerId],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          item_id,
          player_id,
          slot_index,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, 'rat_tail', $2, 0, 4, $3::jsonb, now())
      `,
      [
        `inventory:${input.sellerId}:0`,
        input.sellerId,
        JSON.stringify({
          itemId: 'rat_tail',
          itemInstanceId: `inventory:${input.sellerId}:0`,
          count: 4,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export async function seedMarketSellNowFixture(
  pool: Pool,
  input: {
    sellerId: string;
    sellerRuntimeOwnerId: string;
    sellerSessionEpoch: number;
    buyerId: string;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.sellerId, true, true, input.now, input.sellerRuntimeOwnerId, input.sellerSessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 3, 0, 1, now())
      `,
      [input.sellerId],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          item_id,
          player_id,
          slot_index,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, 'rat_tail', $2, 0, 4, $3::jsonb, now())
      `,
      [
        `inventory:${input.sellerId}:0`,
        input.sellerId,
        JSON.stringify({
          itemId: 'rat_tail',
          itemInstanceId: `inventory:${input.sellerId}:0`,
          count: 4,
        }),
      ],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 0, 0, 1, now())
        ON CONFLICT (player_id, wallet_type) DO NOTHING
      `,
      [input.buyerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export function buildMarketSellNowSellerInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

export function buildMarketSellNowSellerWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 9,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

export function buildMarketSellNowMatches(buyerId: string) {
  return [
    {
      buyerId,
      tradeQuantity: 2,
      totalCost: 6,
      nextBuyerInventoryItems: [
        {
          itemId: 'rat_tail',
          count: 2,
          rawPayload: {
            itemId: 'rat_tail',
            count: 2,
          },
        },
      ],
    },
  ];
}

export function buildMarketBuyNowBuyerInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

export function buildMarketBuyNowBuyerWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 14,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

export function buildMarketBuyNowMatches(sellerId: string) {
  return [
    {
      sellerId,
      tradeQuantity: 2,
      totalCost: 6,
      nextSellerInventoryItems: [
        {
          itemId: 'rat_tail',
          count: 2,
          rawPayload: {
            itemId: 'rat_tail',
            count: 2,
          },
        },
      ],
      nextSellerWalletBalances: [
        {
          walletType: 'spirit_stone',
          balance: 9,
          frozenBalance: 0,
          version: 2,
        },
      ],
    },
  ];
}

export async function seedMarketCancelFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 5, 0, 1, now())
      `,
      [input.playerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export function buildMarketCancelSellInventoryItems() {
  return [
    {
      itemId: 'rat_tail',
      count: 2,
      rawPayload: {
        itemId: 'rat_tail',
        count: 2,
      },
    },
  ];
}

export function buildMarketCancelWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 5,
      frozenBalance: 0,
      version: 1,
    },
  ];
}

export async function seedNpcShopFixtureImpl(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_wallet(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        VALUES ($1, 'spirit_stone', 20, 0, 1, now())
      `,
      [input.playerId],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          locked_by,
          updated_at
        )
        VALUES ($1, $2, 0, 'spirit_stone', 20, '{}'::jsonb, NULL, now())
      `,
      [`inv:${input.playerId}:0`, input.playerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export function buildNextInventoryItems() {
  return [
    {
      itemId: 'spirit_stone',
      count: 1,
      rawPayload: {
        itemId: 'spirit_stone',
        count: 1,
      },
    },
  ];
}

export function buildNextWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 1,
      frozenBalance: 0,
      version: 1,
    },
  ];
}

export function buildNpcShopInventoryItemsImpl() {
  return [
    {
      itemId: 'spirit_stone',
      itemInstanceId: 'inv:legacy-shop-player:0',
      count: 10,
      rawPayload: {
        itemId: 'spirit_stone',
        count: 10,
      },
    },
    {
      itemId: 'qi_pill',
      itemInstanceId: 'inv:legacy-shop-player:1',
      count: 2,
      rawPayload: {
        itemId: 'qi_pill',
        count: 2,
      },
    },
  ];
}

export function buildNpcShopWalletBalancesImpl() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 10,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

export function buildActiveJobStartInventoryItems() {
  return [
    {
      itemId: 'moon_grass',
      count: 1,
      rawPayload: {
        itemId: 'moon_grass',
        count: 1,
      },
    },
  ];
}

export function buildActiveJobStartWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 6,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

export function buildActiveJobStartEnhancementRecords() {
  return [
    {
      itemId: 'iron_sword',
      itemName: '铁剑',
      highestLevel: 1,
      levels: [],
      actionStartedAt: 100,
      actionEndedAt: null,
      startLevel: 1,
      initialTargetLevel: 2,
      desiredTargetLevel: 2,
      protectionStartLevel: null,
      status: 'running',
    },
  ];
}

export function buildActiveJobCancelInventoryItems() {
  return [
    {
      itemId: 'moon_grass',
      count: 4,
      rawPayload: {
        itemId: 'moon_grass',
        count: 4,
      },
    },
  ];
}

export function buildActiveJobCancelWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 2,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

export function buildActiveJobCancelEnhancementRecords() {
  return [
    {
      itemId: 'iron_sword',
      itemName: '铁剑',
      highestLevel: 2,
      levels: [{ level: 2, success: true }],
      actionStartedAt: 100,
      actionEndedAt: 160,
      startLevel: 1,
      initialTargetLevel: 3,
      desiredTargetLevel: 3,
      protectionStartLevel: null,
      status: 'cancelled',
    },
  ];
}

export function buildActiveJobCancelEquipmentSlots() {
  return [
    {
      slot: 'weapon',
      item: {
        itemId: 'iron_sword',
        name: '铁剑',
        count: 1,
        type: 'equipment',
        level: 8,
        enhanceLevel: 1,
      },
    },
    {
      slot: 'body',
      item: null,
    },
  ];
}

export function buildActiveJobCompleteInventoryItems() {
  return [
    {
      itemId: 'qi_pill',
      count: 1,
      rawPayload: {
        itemId: 'qi_pill',
        count: 1,
      },
    },
  ];
}

export function buildActiveJobCompleteWalletBalances() {
  return [
    {
      walletType: 'spirit_stone',
      balance: 6,
      frozenBalance: 0,
      version: 2,
    },
  ];
}

export function buildActiveJobCompleteEnhancementRecords() {
  return [
    {
      itemId: 'iron_sword',
      itemName: '铁剑',
      highestLevel: 3,
      levels: [{ level: 3, success: true }],
      actionStartedAt: 100,
      actionEndedAt: 180,
      startLevel: 2,
      initialTargetLevel: 3,
      desiredTargetLevel: 3,
      protectionStartLevel: null,
      status: 'completed',
    },
  ];
}

export async function seedEquipmentFixture(
  pool: Pool,
  input: {
    playerId: string;
    runtimeOwnerId: string;
    sessionEpoch: number;
    now: number;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now())
      `,
      [input.playerId, true, true, input.now, input.runtimeOwnerId, input.sessionEpoch],
    );
    await client.query(
      `
        INSERT INTO player_inventory_item(
          item_instance_id,
          item_id,
          player_id,
          slot_index,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, 0, 1, $4::jsonb, now())
      `,
      [
        `inventory:${input.playerId}:0`,
        'iron_sword',
        input.playerId,
        JSON.stringify({
          itemId: 'iron_sword',
          itemInstanceId: `inventory:${input.playerId}:0`,
          count: 1,
          slot: 'weapon',
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await rollbackAndThrow(client, error);
  } finally {
    client.release();
  }
}

export function buildEquipmentSlots(playerId: string) {
  const itemInstanceId = `inventory:${playerId}:0`;
  return [
    {
      slot: 'weapon',
      itemInstanceId,
      item: {
        itemId: 'iron_sword',
        itemInstanceId,
        count: 1,
        slot: 'weapon',
        enhanceLevel: 4,
      },
    },
  ];
}

export function buildUnequippedEnhancedInventoryItems(playerId: string) {
  const itemInstanceId = `inventory:${playerId}:0`;
  return [
    {
      itemId: 'iron_sword',
      itemInstanceId,
      count: 1,
      slot: 'weapon',
      enhanceLevel: 4,
      rawPayload: {
        itemId: 'iron_sword',
        itemInstanceId,
        count: 1,
        slot: 'weapon',
        enhanceLevel: 4,
      },
    },
  ];
}


export function buildActiveJobSnapshot(
  playerId: string,
  options: {
    jobRunId: string;
    jobType: 'alchemy' | 'enhancement';
    jobVersion: number;
    phase: string;
    remainingTicks: number;
  },
) {
  return {
    jobRunId: options.jobRunId,
    jobType: options.jobType,
    status: options.remainingTicks > 0 ? 'running' : 'completed',
    phase: options.phase,
    startedAt: Date.now(),
    finishedAt: options.remainingTicks > 0 ? null : Date.now(),
    pausedTicks: options.phase === 'paused' ? 2 : 0,
    totalTicks: 12,
    remainingTicks: options.remainingTicks,
    successRate: options.jobType === 'alchemy' ? 0.9 : 0.75,
    speedRate: options.jobType === 'alchemy' ? 1.1 : 1.2,
    jobVersion: options.jobVersion,
    detailJson: {
      playerId,
      jobRunId: options.jobRunId,
      jobType: options.jobType,
      jobVersion: options.jobVersion,
      phase: options.phase,
      remainingTicks: options.remainingTicks,
      status: options.remainingTicks > 0 ? 'running' : 'completed',
    },
  };
}

export function buildNextSnapshot(now: number, instanceId = 'public:yunlai_town'): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt: now + 1,
    placement: {
      instanceId,
      templateId: 'yunlai_town',
      x: 31,
      y: 54,
      facing: 1,
    },
    worldPreference: {
      linePreset: 'peaceful',
    },
    vitals: {
      hp: 100,
      maxHp: 100,
      qi: 0,
      maxQi: 100,
    },
    progression: {
      foundation: 0,
      combatExp: 0,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    unlockedMapIds: ['yunlai_town'],
    inventory: {
      revision: 2,
      capacity: 24,
      items: buildNextInventoryItems().map((entry) => ({ ...entry.rawPayload })),
    },
    wallet: {
      balances: buildNextWalletBalances(),
    },
    equipment: {
      revision: 1,
      slots: [],
    },
    artifacts: {
      revision: 0,
      slots: [],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    buffs: {
      revision: 1,
      buffs: [],
    },
    quests: {
      revision: 1,
      entries: [],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
}
