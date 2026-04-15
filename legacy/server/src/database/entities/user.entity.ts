/**
 * 用户账号实体 —— 存储登录凭据与显示名称
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** BIGINT_NUMBER_TRANSFORMER：定义该变量以承载业务值。 */
const BIGINT_NUMBER_TRANSFORMER = {
  to: (value: number): number => value,
  from: (value: string | number): number => Number(value),
};

/** 用户表，一个用户对应一个游戏角色 */
@Index('idx_users_display_name_unique_except_person', ['displayName'], {
  unique: true,
  where: `"displayName" IS NOT NULL AND "displayName" <> '人'`,
})
@Entity('users')
/** UserEntity：封装相关状态与行为。 */
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 登录用户名（唯一） */
  @Column({ type: 'varchar', length: 50, unique: true })
  username!: string;

  /** 地图上显示的单字符名称，为空时回退到用户名首字符 */
  @Column({ type: 'varchar', length: 16, nullable: true })
  displayName!: string | null;

  /** 注册后待创建角色时使用的角色名称 */
  @Column({ type: 'varchar', length: 50, nullable: true })
  pendingRoleName!: string | null;

  /** bcrypt 密码哈希 */
  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  /** 累计在线时长，单位为秒 */
  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER, default: 0 })
  totalOnlineSeconds!: number;

  /** 当前在线会话开始时间，用于累计在线时长结算 */
  @Column({ type: 'timestamptz', nullable: true })
  currentOnlineStartedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}

