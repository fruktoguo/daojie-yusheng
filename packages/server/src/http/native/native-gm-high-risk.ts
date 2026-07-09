/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
import type { GmActorContext } from './native-gm-actor-context';

/** 高危 GM 操作二次确认请求体的最小形状（兼容旧客户端字段，当前不再强制校验）。 */
export interface GmHighRiskConfirmationBody {
  backupId?: unknown;
  confirmationPhrase?: unknown;
  confirmPhrase?: unknown;
  expectedChecksum?: unknown;
  expectedChecksumSha256?: unknown;
  checksumSha256?: unknown;
  scope?: unknown;
}

/** 高危 GM 操作确认配置（保留结构供调用方声明操作语义，运行期不再强制）。 */
export interface GmHighRiskConfirmationRequirement {
  scope: string;
  confirmationPhrase: string;
  operationName: string;
}

/**
 * 高危 GM 操作放行校验。
 *
 * 当前产品策略：单一 GM 角色，密码登录签发的 token 即具备全部能力。
 * 请求到达此处时已通过 NativeGmAuthGuard；不再额外要求 scope 或 confirmationPhrase。
 * 函数保留调用点是为了兼容既有入口与未来若重新启用分级权限时的挂载位。
 */
export function assertGmHighRiskOperationAllowed(
  _actor: GmActorContext,
  _body: GmHighRiskConfirmationBody | null | undefined,
  _requirement: GmHighRiskConfirmationRequirement,
): void {
  // no-op: 密码鉴权通过即可执行全部 GM 操作
}
