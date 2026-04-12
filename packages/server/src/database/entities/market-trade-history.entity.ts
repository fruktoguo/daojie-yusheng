import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

const NUMERIC_NUMBER_TRANSFORMER = {
  to: (value: number): number => value,
  from: (value: string | number): number => Number(value),
};

@Entity('market_trade_history')
/** MarketTradeHistoryEntity：封装相关状态与行为。 */
export class MarketTradeHistoryEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  buyerId!: string;

  @Column({ type: 'varchar', length: 100 })
  sellerId!: string;

  @Column({ type: 'varchar', length: 100 })
  itemId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'numeric', precision: 20, scale: 1, transformer: NUMERIC_NUMBER_TRANSFORMER })
  unitPrice!: number;

  @Column({ type: 'bigint', transformer: NUMERIC_NUMBER_TRANSFORMER })
  createdAt!: number;
}

