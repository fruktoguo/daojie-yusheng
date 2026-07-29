/** 密室进入密码只在低频管理与准入链路处理，数据库仅保存加盐哈希。 */
import { TIME_CHAMBER_MAX_PASSWORD_LENGTH, type TimeChamberPasswordChangeView } from '@mud/shared';

import { hashPassword, verifyPassword } from '../../auth/password-hash';

export type TimeChamberPasswordHashPatch =
  | { provided: false }
  | { provided: true; passwordHash: string | null };

export type TimeChamberPasswordVerification =
  | { ok: true }
  | { ok: false; reason: 'time_chamber_password_required' | 'time_chamber_password_incorrect' };

/** 把客户端密码统一到稳定 Unicode 表达；不 trim，避免静默改变用户设置的密码。 */
export function normalizeTimeChamberAccessPassword(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFC') : '';
}

export function validateTimeChamberAccessPassword(value: unknown): string | null {
  const password = normalizeTimeChamberAccessPassword(value);
  if (!password || password.trim().length === 0 || password.length > TIME_CHAMBER_MAX_PASSWORD_LENGTH) {
    return 'invalid_time_chamber_password';
  }
  return null;
}

export async function resolveTimeChamberPasswordHashPatch(
  change: TimeChamberPasswordChangeView | undefined,
): Promise<TimeChamberPasswordHashPatch> {
  if (change === undefined) return { provided: false };
  if (change?.action === 'clear') return { provided: true, passwordHash: null };
  if (change?.action !== 'set' || validateTimeChamberAccessPassword(change.password)) {
    throw new Error('invalid_time_chamber_password');
  }
  return {
    provided: true,
    passwordHash: await hashPassword(normalizeTimeChamberAccessPassword(change.password)),
  };
}

export async function verifyTimeChamberAccessPassword(
  candidate: unknown,
  passwordHash: string | null,
): Promise<TimeChamberPasswordVerification> {
  if (!passwordHash) return { ok: true };
  const password = normalizeTimeChamberAccessPassword(candidate);
  if (!password) return { ok: false, reason: 'time_chamber_password_required' };
  if (password.length > TIME_CHAMBER_MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: 'time_chamber_password_incorrect' };
  }
  return await verifyPassword(password, passwordHash)
    ? { ok: true }
    : { ok: false, reason: 'time_chamber_password_incorrect' };
}
