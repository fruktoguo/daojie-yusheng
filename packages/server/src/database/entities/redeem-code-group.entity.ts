import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RedeemCodeEntity } from './redeem-code.entity';

interface RedeemCodeGroupRewardItemRecord {
  itemId: string;
  count: number;
}

@Entity('redeem_code_groups')
export class RedeemCodeGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name!: string;

  @Column({ type: 'jsonb', default: () => '\'[]\'' })
  rewards!: RedeemCodeGroupRewardItemRecord[];

  @OneToMany(() => RedeemCodeEntity, (code) => code.group)
  codes?: RedeemCodeEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
