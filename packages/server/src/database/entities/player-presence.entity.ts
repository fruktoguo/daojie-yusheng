import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('player_presence')
export class PlayerPresenceEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ type: 'boolean', default: false })
  online!: boolean;

  @Column({ type: 'boolean', default: false })
  inWorld!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeatAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  offlineSinceAt!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
