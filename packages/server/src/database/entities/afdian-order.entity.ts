import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('afdian_orders')
@Index('idx_afdian_orders_updated_at', ['updatedAt'])
@Index('idx_afdian_orders_user_id', ['userId'])
@Index('idx_afdian_orders_user_private_id', ['userPrivateId'])
@Index('idx_afdian_orders_status', ['status'])
export class AfdianOrderEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  outTradeNo!: string;

  @Column({ type: 'varchar', length: 64 })
  userId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  userPrivateId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  planId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'int', default: 0 })
  month!: number;

  @Column({ type: 'varchar', length: 32, default: '0.00' })
  totalAmount!: string;

  @Column({ type: 'varchar', length: 32, default: '0.00' })
  showAmount!: string;

  @Column({ type: 'int', default: 0 })
  status!: number;

  @Column({ type: 'text', nullable: true })
  remark!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  redeemId!: string | null;

  @Column({ type: 'int', default: 0 })
  productType!: number;

  @Column({ type: 'varchar', length: 32, default: '0.00' })
  discount!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  skuDetail!: unknown[];

  @Column({ type: 'varchar', length: 128, nullable: true })
  addressPerson!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  addressPhone!: string | null;

  @Column({ type: 'text', nullable: true })
  addressAddress!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'webhook' })
  lastSource!: 'webhook' | 'api';

  @Column({ type: 'jsonb', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
