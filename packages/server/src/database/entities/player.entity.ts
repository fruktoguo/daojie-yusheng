import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';
import { DEFAULT_BASE_ATTRS, Direction, VIEW_RADIUS } from '@mud/shared';

@Entity('players')
export class PlayerEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  @Column({ type: 'uuid', unique: true })
  userId!: string;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  @Column({ type: 'varchar', length: 50, default: 'spawn' })
  mapId!: string;

  @Column({ type: 'int' })
  x!: number;

  @Column({ type: 'int' })
  y!: number;

  @Column({ type: 'int', default: Direction.South })
  facing!: number;

  @Column({ type: 'int', default: VIEW_RADIUS })
  viewRange!: number;

  @Column({ type: 'int' })
  hp!: number;

  @Column({ type: 'int' })
  maxHp!: number;

  @Column({ type: 'int', default: 0 })
  qi!: number;

  @Column({ type: 'boolean', default: false })
  dead!: boolean;

  @Column({ type: 'jsonb', default: () => `'${JSON.stringify(DEFAULT_BASE_ATTRS)}'` })
  baseAttrs!: Record<string, number>;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  bonuses!: unknown[];

  @Column({ type: 'jsonb', default: () => `'{"items":[],"capacity":30}'` })
  inventory!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'{"weapon":null,"head":null,"body":null,"legs":null,"accessory":null}'` })
  equipment!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  techniques!: unknown[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  quests!: unknown[];

  @Column({ type: 'boolean', default: false })
  autoBattle!: boolean;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  autoBattleSkills!: unknown[];

  @Column({ type: 'boolean', default: true })
  autoRetaliate!: boolean;

  @Column({ type: 'varchar', nullable: true })
  cultivatingTechId!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
