/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { GmActorContext } from './native-gm-actor-context';

/** 高危 GM 操作二次确认请求体的最小形状。 */
export interface GmHighRiskConfirmationBody {
  backupId?: unknown;
  confirmationPhrase?: unknown;
  confirmPhrase?: unknown;
  expectedChecksum?: unknown;
  expectedChecksumSha256?: unknown;
  checksumSha256?: unknown;
  scope?: unknown;
}

/** 高危 GM 操作确认配置。 */
export interface GmHighRiskConfirmationRequirement {
  scope: string;
  confirmationPhrase: string;
  operationName: string;
}

/**
 * 校验高危 GM 操作的 scope 与人工确认短语。
 * - scope 来自 GM access token payload，用于把旧 token 与高危能力隔离；
 * - confirmationPhrase 必须逐字匹配，防止误触恢复、清库、明文密钥读取等操作。
 */
export function assertGmHighRiskOperationAllowed(
  actor: GmActorContext,
  body: GmHighRiskConfirmationBody | null | undefined,
  requirement: GmHighRiskConfirmationRequirement,
): void {
  const scopes = new Set(actor.scopes ?? []);
  if (!scopes.has(requirement.scope)) {
    throw new ForbiddenException(`GM token 缺少高危操作 scope：${requirement.scope}`);
  }

  const phrase = pickConfirmationPhrase(body);
  if (phrase !== requirement.confirmationPhrase) {
    throw new BadRequestException(
      `${requirement.operationName} 需要 confirmationPhrase 精确等于 "${requirement.confirmationPhrase}"`,
    );
  }
}

function pickConfirmationPhrase(body: GmHighRiskConfirmationBody | null | undefined): string {
  const raw = typeof body?.confirmationPhrase === 'string'
    ? body.confirmationPhrase
    : typeof body?.confirmPhrase === 'string'
      ? body.confirmPhrase
      : '';
  return raw.trim();
}
