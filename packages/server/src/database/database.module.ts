/**
 * 数据库模块 —— 配置 PostgreSQL (TypeORM) 连接与 Redis 服务，全局导出
 */
import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UserEntity } from './entities/user.entity';
import { PlayerEntity } from './entities/player.entity';
import { SuggestionEntity } from './entities/suggestion.entity';
import { MarketOrderEntity } from './entities/market-order.entity';
import { MarketTradeHistoryEntity } from './entities/market-trade-history.entity';
import { MailAudienceMemberEntity } from './entities/mail-audience-member.entity';
import { MailCampaignEntity } from './entities/mail-campaign.entity';
import { PersistentDocumentEntity } from './entities/persistent-document.entity';
import { PlayerMailReceiptEntity } from './entities/player-mail-receipt.entity';
import { RedeemCodeGroupEntity } from './entities/redeem-code-group.entity';
import { RedeemCodeEntity } from './entities/redeem-code.entity';
import { GmRiskOperationAuditEntity } from './entities/gm-risk-operation-audit.entity';
import { PlayerCollectionsEntity } from './entities/player-collections.entity';
import { PlayerSettingsEntity } from './entities/player-settings.entity';
import { PlayerPresenceEntity } from './entities/player-presence.entity';
import { PersistentDocumentService } from './persistent-document.service';
import { RedisService } from './redis.service';

/** DATABASE_ENTITIES：定义该变量以承载业务值。 */
const DATABASE_ENTITIES = [
  UserEntity,
  PlayerEntity,
  SuggestionEntity,
  MarketOrderEntity,
  MarketTradeHistoryEntity,
  MailCampaignEntity,
  MailAudienceMemberEntity,
  PlayerMailReceiptEntity,
  PersistentDocumentEntity,
  RedeemCodeGroupEntity,
  RedeemCodeEntity,
  GmRiskOperationAuditEntity,
  PlayerCollectionsEntity,
  PlayerSettingsEntity,
  PlayerPresenceEntity,
];

/** PRESYNC_BIGINT_COLUMNS：定义该变量以承载业务值。 */
const PRESYNC_BIGINT_COLUMNS = [
  { table: 'users', column: 'totalOnlineSeconds' },
  { table: 'players', column: 'foundation' },
  { table: 'players', column: 'combatExp' },
  { table: 'players', column: 'playerKillCount' },
  { table: 'players', column: 'monsterKillCount' },
  { table: 'players', column: 'eliteMonsterKillCount' },
  { table: 'players', column: 'bossMonsterKillCount' },
  { table: 'players', column: 'deathCount' },
 ] as const;

/** PRESYNC_MARKET_PRICE_COLUMNS：定义该变量以承载业务值。 */
const PRESYNC_MARKET_PRICE_COLUMNS = [
  { table: 'market_orders', column: 'unitPrice' },
  { table: 'market_trade_history', column: 'unitPrice' },
] as const;

/** PgBootstrapConnectionOptions：定义该类型的结构与数据语义。 */
type PgBootstrapConnectionOptions = {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
};

/** PgBootstrapQueryResult：定义该接口的能力与字段约束。 */
interface PgBootstrapQueryResult<Row> {
/** rowCount：定义该变量以承载业务值。 */
  rowCount: number | null;
/** rows：定义该变量以承载业务值。 */
  rows: Row[];
}

/** PgBootstrapClient：定义该接口的能力与字段约束。 */
interface PgBootstrapClient {
  connect(): Promise<void>;
  query<Row>(sql: string, params?: unknown[]): Promise<PgBootstrapQueryResult<Row>>;
  end(): Promise<void>;
}

const { Client: PgClient } = require('pg') as {
  Client: new (options: PgBootstrapConnectionOptions) => PgBootstrapClient;
};

/** 全局数据库模块，提供 TypeORM Repository 和 RedisService */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService) => {
/** baseOptions：定义该变量以承载业务值。 */
        const baseOptions = buildBasePostgresOptions(cfg);
        await applyPreSynchronizeCompatibilityFixes(baseOptions);

/** url：定义该变量以承载业务值。 */
        const url = cfg.get<string>('DATABASE_URL');
        if (url) {
          return {
            type: 'postgres' as const,
            url,
            entities: DATABASE_ENTITIES,
            synchronize: true, // 开发阶段自动同步表结构
          };
        }

        return {
          type: 'postgres' as const,
          host: baseOptions.host,
          port: baseOptions.port,
          username: baseOptions.user,
          password: baseOptions.password,
          database: baseOptions.database,
          entities: DATABASE_ENTITIES,
          synchronize: true, // 开发阶段自动同步表结构
        };
      },
    }),
    TypeOrmModule.forFeature([
      UserEntity,
      PlayerEntity,
      SuggestionEntity,
      MarketOrderEntity,
      MarketTradeHistoryEntity,
      MailCampaignEntity,
      MailAudienceMemberEntity,
      PlayerMailReceiptEntity,
      PersistentDocumentEntity,
      RedeemCodeGroupEntity,
      RedeemCodeEntity,
      GmRiskOperationAuditEntity,
      PlayerCollectionsEntity,
      PlayerSettingsEntity,
      PlayerPresenceEntity,
    ]),
  ],
  providers: [RedisService, PersistentDocumentService],
  exports: [TypeOrmModule, RedisService, PersistentDocumentService],
})
/** DatabaseModule：封装相关状态与行为。 */
export class DatabaseModule {}

/** buildBasePostgresOptions：执行对应的业务逻辑。 */
export function buildBasePostgresOptions(cfg: ConfigService): PgBootstrapConnectionOptions {
/** url：定义该变量以承载业务值。 */
  const url = cfg.get<string>('DATABASE_URL');
  if (url) {
    return {
      connectionString: url,
    };
  }

  return {
    host: cfg.get<string>('DB_HOST', 'localhost'),
    port: cfg.get<number>('DB_PORT', 5432),
    user: cfg.get<string>('DB_USERNAME', 'postgres'),
    password: cfg.get<string>('DB_PASSWORD', 'postgres'),
    database: cfg.get<string>('DB_DATABASE', 'daojie_yusheng'),
  };
}

/** applyPreSynchronizeCompatibilityFixes：执行对应的业务逻辑。 */
export async function applyPreSynchronizeCompatibilityFixes(connectionOptions: PgBootstrapConnectionOptions): Promise<void> {
/** client：定义该变量以承载业务值。 */
  const client = new PgClient(connectionOptions);
  await client.connect();
  try {
    for (const entry of PRESYNC_BIGINT_COLUMNS) {
      const row = await client.query<{
/** data_type：定义该变量以承载业务值。 */
        data_type: string;
      }>(
        `
          SELECT data_type
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = $1
            AND column_name = $2
          LIMIT 1
        `,
        [entry.table, entry.column],
      );
      if (row.rowCount === 0) {
        continue;
      }

      await client.query(`
        UPDATE ${quotePgIdentifier(entry.table)}
        SET ${quotePgIdentifier(entry.column)} = 0
        WHERE ${quotePgIdentifier(entry.column)} IS NULL
      `);

      if (row.rows[0]?.data_type === 'integer') {
        await client.query(`
          ALTER TABLE ${quotePgIdentifier(entry.table)}
          ALTER COLUMN ${quotePgIdentifier(entry.column)} TYPE bigint
          USING COALESCE(${quotePgIdentifier(entry.column)}, 0)::bigint
        `);
      }
    }

    for (const entry of PRESYNC_MARKET_PRICE_COLUMNS) {
      const row = await client.query<{
/** data_type：定义该变量以承载业务值。 */
        data_type: string;
/** numeric_scale：定义该变量以承载业务值。 */
        numeric_scale: number | null;
      }>(
        `
          SELECT data_type, numeric_scale
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = $1
            AND column_name = $2
          LIMIT 1
        `,
        [entry.table, entry.column],
      );
      if (row.rowCount === 0) {
        continue;
      }

      await client.query(`
        UPDATE ${quotePgIdentifier(entry.table)}
        SET ${quotePgIdentifier(entry.column)} = 0
        WHERE ${quotePgIdentifier(entry.column)} IS NULL
      `);

/** dataType：定义该变量以承载业务值。 */
      const dataType = row.rows[0]?.data_type;
/** numericScale：定义该变量以承载业务值。 */
      const numericScale = Number(row.rows[0]?.numeric_scale ?? 0);
      if (dataType !== 'numeric' || numericScale !== 1) {
        await client.query(`
          ALTER TABLE ${quotePgIdentifier(entry.table)}
          ALTER COLUMN ${quotePgIdentifier(entry.column)} TYPE numeric(20, 1)
          USING COALESCE(${quotePgIdentifier(entry.column)}, 0)::numeric(20, 1)
        `);
      }
    }
  } finally {
    await client.end();
  }
}

/** quotePgIdentifier：执行对应的业务逻辑。 */
function quotePgIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
