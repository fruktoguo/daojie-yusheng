import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

const BIGINT_NUMBER_TRANSFORMER = {
  to: (value: number | null): number | null => value,
  from: (value: string | number | null): number | null => value == null ? null : Number(value),
};

@Entity('player_mail_receipts')
/** PlayerMailReceiptEntity：封装相关状态与行为。 */
export class PlayerMailReceiptEntity {
  @PrimaryColumn({ type: 'uuid' })
  mailId!: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER, nullable: true })
  firstSeenAt!: number | null;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER, nullable: true })
  readAt!: number | null;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER, nullable: true })
  claimedAt!: number | null;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER, nullable: true })
  deletedAt!: number | null;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER })
  updatedAt!: number;
}

