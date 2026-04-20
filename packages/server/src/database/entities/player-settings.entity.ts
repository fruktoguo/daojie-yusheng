import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('player_settings')
export class PlayerSettingsEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  unlockedMinimapIds!: unknown[];

  @Column({ type: 'jsonb', default: () => '\'{"level":1,"exp":0,"expToNext":60}\'' })
  alchemySkill!: unknown;

  @Column({ type: 'jsonb', default: () => '\'{"level":1,"exp":0,"expToNext":60}\'' })
  gatherSkill!: unknown;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  alchemyPresets!: unknown[];

  @Column({ type: 'jsonb', default: () => '\'null\'' })
  alchemyJob!: unknown | null;

  @Column({ type: 'int', default: 1 })
  enhancementSkillLevel!: number;

  @Column({ type: 'jsonb', default: () => '\'null\'' })
  enhancementJob!: unknown | null;

  @Column({ type: 'jsonb', default: () => '\'[]\'' })
  enhancementRecords!: unknown;

  @Column({ type: 'boolean', default: false })
  autoBattle!: boolean;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  autoBattleSkills!: unknown[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  autoUsePills!: unknown[];

  @Column({ type: 'jsonb', default: () => '\'{"hostile":["monster","demonized_players","retaliators","terrain"],"friendly":["non_hostile_players"]}\'' })
  combatTargetingRules!: unknown;

  @Column({ type: 'varchar', default: 'auto' })
  autoBattleTargetingMode!: string;

  @Column({ type: 'varchar', nullable: true })
  combatTargetId!: string | null;

  @Column({ type: 'boolean', default: false })
  combatTargetLocked!: boolean;

  @Column({ type: 'boolean', default: true })
  autoRetaliate!: boolean;

  @Column({ type: 'boolean', default: false })
  autoBattleStationary!: boolean;

  @Column({ type: 'boolean', default: false })
  allowAoePlayerHit!: boolean;

  @Column({ type: 'boolean', default: true })
  autoIdleCultivation!: boolean;

  @Column({ type: 'boolean', default: false })
  autoSwitchCultivation!: boolean;

  @Column({ type: 'varchar', nullable: true })
  cultivatingTechId!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
