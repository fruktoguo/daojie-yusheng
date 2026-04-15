import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import { MarketOrderSide, MarketOrderStatus } from '@mud/shared';

/** NUMERIC_NUMBER_TRANSFORMER：定义该变量以承载业务值。 */
const NUMERIC_NUMBER_TRANSFORMER = {
  to: (value: number): number => value,
  from: (value: string | number): number => Number(value),
};

@Entity('market_orders')
/** MarketOrderEntity：封装相关状态与行为。 */
export class MarketOrderEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  ownerId!: string;

  @Column({ type: 'varchar', length: 64 })
  ownerName!: string;

  @Column({ type: 'varchar', length: 16 })
  side!: MarketOrderSide;

  @Column({ type: 'text' })
  itemKey!: string;

  @Column({ type: 'jsonb' })
  itemSnapshot!: Record<string, unknown>;

  @Column({ type: 'int' })
  remainingQuantity!: number;

  @Column({ type: 'numeric', precision: 20, scale: 1, transformer: NUMERIC_NUMBER_TRANSFORMER })
  unitPrice!: number;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: MarketOrderStatus;

  @Column({ type: 'bigint', transformer: NUMERIC_NUMBER_TRANSFORMER })
  createdAt!: number;

  @Column({ type: 'bigint', transformer: NUMERIC_NUMBER_TRANSFORMER })
  updatedAt!: number;
}

