/**
 * 玩家角色实体 —— 持久化角色的位置、属性、背包、功法等全部存档数据
 */
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  DEFAULT_BASE_ATTRS,
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  VIEW_RADIUS,
} from '@mud/shared';

/** 玩家角色存档表，主键为角色存档 ID */
@Entity('players')
export class PlayerEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  id!: string;

  /** 所属用户 ID */
  @Column({ type: 'uuid', unique: true })
  userId!: string;

  /** 角色名称 */
  @Column({ type: 'varchar', length: 50 })
  name!: string;

  /** 当前所在地图 ID */
  @Column({ type: 'varchar', length: 50, default: 'yunlai_town' })
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

  /** 底蕴，可在获得境界经验时额外转化为经验增益 */
  @Column({ type: 'int', default: 0 })
  foundation!: number;

  /** 战斗经验，影响战斗中的命中与闪避优势 */
  @Column({ type: 'int', default: 0 })
  combatExp!: number;

  /** 角色初始骨龄（岁） */
  @Column({ type: 'int', default: DEFAULT_BONE_AGE_YEARS })
  boneAgeBaseYears!: number;

  /** 在世界中累计经历的有效时序 tick */
  @Column({ type: 'double precision', default: 0 })
  lifeElapsedTicks!: number;

  /** 寿元上限（当前预留） */
  @Column({ type: 'int', nullable: true })
  lifespanYears!: number | null;

  /** 基础属性（力量、敏捷等） */
  @Column({ type: 'jsonb', default: () => `'${JSON.stringify(DEFAULT_BASE_ATTRS)}'` })
  baseAttrs!: Record<string, number>;

  /** 永久加成列表 */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  bonuses!: unknown[];

  /** 临时 Buff 列表（含剩余时间） */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  temporaryBuffs!: unknown[];

  /** 背包数据 */
  @Column({ type: 'jsonb', default: () => `'{"items":[],"capacity":${DEFAULT_INVENTORY_CAPACITY}}'` })
  inventory!: Record<string, unknown>;

  /** 坊市托管仓 */
  @Column({ type: 'jsonb', default: () => '\'{"items":[]}\'' })
  marketStorage!: Record<string, unknown>;

  /** 装备栏 */
  @Column({ type: 'jsonb', default: () => `'{"weapon":null,"head":null,"body":null,"legs":null,"accessory":null}'` })
  equipment!: Record<string, unknown>;

  /** 已学功法列表 */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  techniques!: unknown[];

  /** 任务进度 */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  quests!: unknown[];

  /** 任务自动跨图导航冷却截止的玩家时序 tick */
  @Column({ type: 'double precision', default: 0 })
  questCrossMapNavCooldownUntilLifeTicks!: number;

  /** 已揭示的突破需求 ID */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  revealedBreakthroughRequirementIds!: unknown[];

  /** 开天门过程中的暂存状态 */
  @Column({ type: 'jsonb', default: () => '\'null\'' })
  heavenGate!: unknown | null;

  /** 已确认写入角色的灵根数值 */
  @Column({ type: 'jsonb', default: () => '\'null\'' })
  spiritualRoots!: unknown | null;

  /** 已解锁的小地图 ID */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  unlockedMinimapIds!: unknown[];

  /** 是否开启自动战斗 */
  @Column({ type: 'boolean', default: false })
  autoBattle!: boolean;

  /** 自动战斗使用的技能列表 */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  autoBattleSkills!: unknown[];

  /** 当前自动战斗锁定的目标引用 */
  @Column({ type: 'varchar', nullable: true })
  combatTargetId!: string | null;

  /** 当前目标是否为强制锁定目标 */
  @Column({ type: 'boolean', default: false })
  combatTargetLocked!: boolean;

  /** 是否自动反击 */
  @Column({ type: 'boolean', default: true })
  autoRetaliate!: boolean;

  /** 自动战斗是否保持原地施法 */
  @Column({ type: 'boolean', default: false })
  autoBattleStationary!: boolean;

  /** 是否允许群体攻击命中玩家 */
  @Column({ type: 'boolean', default: false })
  allowAoePlayerHit!: boolean;

  /** 是否自动闲时修炼 */
  @Column({ type: 'boolean', default: true })
  autoIdleCultivation!: boolean;

  /** 主修功法圆满后是否自动切换下一门功法 */
  @Column({ type: 'boolean', default: false })
  autoSwitchCultivation!: boolean;

  /** 当前正在修炼的功法 ID */
  @Column({ type: 'varchar', nullable: true })
  cultivatingTechId!: string | null;

  /** 当前是否在线 */
  @Column({ type: 'boolean', default: false })
  online!: boolean;

  /** 当前是否仍在世界中 */
  @Column({ type: 'boolean', default: false })
  inWorld!: boolean;

  /** 最近一次收到心跳的时间 */
  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeatAt!: Date | null;

  /** 最近一次进入离线状态的时间 */
  @Column({ type: 'timestamptz', nullable: true })
  offlineSinceAt!: Date | null;

  /** 角色创建时间；旧数据会在启动时按已有信息回填 */
  @CreateDateColumn({ type: 'timestamptz', nullable: true })
  createdAt!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
