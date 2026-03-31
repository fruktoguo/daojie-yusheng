import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RedeemCodeGroupEntity } from './redeem-code-group.entity';

@Entity('redeem_codes')
@Index('idx_redeem_codes_code', ['code'], { unique: true })
@Index('idx_redeem_codes_group_id', ['groupId'])
@Index('idx_redeem_codes_status', ['status'])
export class RedeemCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  groupId!: string;

  @ManyToOne(() => RedeemCodeGroupEntity, (group) => group.codes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group!: RedeemCodeGroupEntity;

  @Column({ type: 'varchar', length: 36, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'used' | 'destroyed';

  @Column({ type: 'varchar', length: 100, nullable: true })
  usedByPlayerId!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  usedByRoleName!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  destroyedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
