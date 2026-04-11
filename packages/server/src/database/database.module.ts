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
import { PersistentDocumentService } from './persistent-document.service';
import { RedisService } from './redis.service';

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
];

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

const PRESYNC_MARKET_PRICE_COLUMNS = [
  { table: 'market_orders', column: 'unitPrice' },
  { table: 'market_trade_history', column: 'unitPrice' },
] as const;

type PgBootstrapConnectionOptions = {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
};

interface PgBootstrapQueryResult<Row> {
  rowCount: number | null;
  rows: Row[];
}

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
        const baseOptions = buildBasePostgresOptions(cfg);
        await applyPreSynchronizeCompatibilityFixes(baseOptions);

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
    ]),
  ],
  providers: [RedisService, PersistentDocumentService],
  exports: [TypeOrmModule, RedisService, PersistentDocumentService],
})
export class DatabaseModule {}

function buildBasePostgresOptions(cfg: ConfigService): PgBootstrapConnectionOptions {
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

async function applyPreSynchronizeCompatibilityFixes(connectionOptions: PgBootstrapConnectionOptions): Promise<void> {
  const client = new PgClient(connectionOptions);
  await client.connect();
  try {
    for (const entry of PRESYNC_BIGINT_COLUMNS) {
      const row = await client.query<{
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
        data_type: string;
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

      const dataType = row.rows[0]?.data_type;
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

function quotePgIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
