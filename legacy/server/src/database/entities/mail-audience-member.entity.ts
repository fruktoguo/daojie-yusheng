import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('mail_audience_members')
export class MailAudienceMemberEntity {
  @PrimaryColumn({ type: 'uuid' })
  mailId!: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ type: 'bigint' })
  createdAt!: number;
}


