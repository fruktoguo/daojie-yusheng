/**
 * 玩家建议实体 —— 持久化玩家提交的建议、状态与投票记录
 */
import {
  Entity,
  PrimaryColumn,
  Column,
} from 'typeorm';
import { SuggestionStatus } from '@mud/shared';

const BIGINT_NUMBER_TRANSFORMER = {
  to: (value: number): number => value,
  from: (value: string | number): number => Number(value),
};

@Entity('suggestions')
export class SuggestionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  authorId!: string;

  @Column({ type: 'varchar', length: 64 })
  authorName!: string;

  @Column({ type: 'varchar', length: 80 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: SuggestionStatus;

  @Column({ type: 'jsonb', default: () => '\'[]\'' })
  upvotes!: string[];

  @Column({ type: 'jsonb', default: () => '\'[]\'' })
  downvotes!: string[];

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER })
  createdAt!: number;
}
