/**
 * GM 兼容转换共享类型。
 *
 * 兼容转换只用于 GM 显式运维入口，不进入运行时加载、战斗或内容热路径。
 */
import type { GmActorContext } from '../../http/native/native-gm-actor-context';

export type GmCompatConversionMode = 'dry-run' | 'apply';

export interface GmCompatConversionRunOptions {
  mode: GmCompatConversionMode;
  actor?: GmActorContext | null;
}

export interface GmCompatConversionSample {
  id: string;
  name: string;
  status: string;
  before: unknown;
  after: unknown;
}

export interface GmCompatConversionRunResult {
  ok: true;
  conversionId: string;
  mode: GmCompatConversionMode;
  matchedRows: number;
  convertedRows: number;
  skippedRows: number;
  failedRows: number;
  verifiedRows: number;
  samples: GmCompatConversionSample[];
  errors: string[];
  appliedAt?: string;
}

