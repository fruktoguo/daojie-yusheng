import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RedeemCodeEntity } from './redeem-code.entity';

/** RedeemCodeGroupRewardItemRecord：定义该接口的能力与字段约束。 */
interface RedeemCodeGroupRewardItemRecord {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

@Entity('redeem_code_groups')
/** RedeemCodeGroupEntity：封装相关状态与行为。 */
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

