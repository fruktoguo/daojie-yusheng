import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import type { MailAttachment, MailTemplateArg } from '@mud/shared';

const BIGINT_NUMBER_TRANSFORMER = {
  to: (value: number): number => value,
  from: (value: string | number): number => Number(value),
};

@Entity('mail_campaigns')
/** MailCampaignEntity：封装相关状态与行为。 */
export class MailCampaignEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  scope!: 'global' | 'direct';

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'cancelled';

  @Column({ type: 'varchar', length: 64, nullable: true })
  templateId!: string | null;

  @Column({ type: 'jsonb', default: () => '\'[]\'' })
  args!: MailTemplateArg[];

  @Column({ type: 'varchar', length: 80, nullable: true })
  fallbackTitle!: string | null;

  @Column({ type: 'text', nullable: true })
  fallbackBody!: string | null;

  @Column({ type: 'varchar', length: 64, default: '司命台' })
  senderLabel!: string;

  @Column({ type: 'jsonb', default: () => '\'[]\'' })
  attachments!: MailAttachment[];

  @Column({ type: 'boolean', default: false })
  hasAttachments!: boolean;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER })
  createdAt!: number;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER })
  updatedAt!: number;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER, nullable: true })
  startAt!: number | null;

  @Column({ type: 'bigint', transformer: BIGINT_NUMBER_TRANSFORMER, nullable: true })
  expireAt!: number | null;
}


