import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DEFAULT_INVENTORY_CAPACITY } from '@mud/shared';

@Entity('player_collections')
export class PlayerCollectionsEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  temporaryBuffs!: unknown[];

  @Column({ type: 'jsonb', default: () => `'{"items":[],"capacity":${DEFAULT_INVENTORY_CAPACITY}}'` })
  inventory!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => '\'{"items":[]}\'' })
  marketStorage!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'{"weapon":null,"head":null,"body":null,"legs":null,"accessory":null}'` })
  equipment!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  techniques!: unknown[];

  @Column({ type: 'jsonb', default: () => '\'{"level":0,"exp":0,"expToNext":10000}\'' })
  bodyTraining!: unknown;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  quests!: unknown[];

  @UpdateDateColumn()
  updatedAt!: Date;
}
