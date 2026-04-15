import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('gm_risk_operation_audits')
/** GmRiskOperationAuditEntity：封装 GM 风险批量操作审计记录。 */
export class GmRiskOperationAuditEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  action!: 'batch-ban-by-risk';

  @Column({ type: 'varchar', length: 40, default: 'gm' })
  operator!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Column({ type: 'int', default: 0 })
  minRiskScore!: number;

  @Column({ type: 'int', default: 0 })
  matchedPlayers!: number;

  @Column({ type: 'int', default: 0 })
  bannedPlayers!: number;

  @Column({ type: 'int', default: 0 })
  skippedPlayers!: number;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  filters!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  samplePlayerIds!: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
