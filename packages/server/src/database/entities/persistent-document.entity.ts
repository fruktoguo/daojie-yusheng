import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('persistent_documents')
/** PersistentDocumentEntity：封装相关状态与行为。 */
export class PersistentDocumentEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  scope!: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  key!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @UpdateDateColumn()
  updatedAt!: Date;
}

