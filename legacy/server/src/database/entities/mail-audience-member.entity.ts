import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('mail_audience_members')
/** MailAudienceMemberEntity：封装相关状态与行为。 */
export class MailAudienceMemberEntity {
  @PrimaryColumn({ type: 'uuid' })
  mailId!: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  playerId!: string;

  @Column({ type: 'bigint' })
  createdAt!: number;
}


