// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMailHelper = void 0;

/** 世界 socket 邮件 helper：只收敛 mail 相关入口。 */
class WorldGatewayMailHelper {
/**
 * gateway：gateway相关字段。
 */

    gateway;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * handleNextRequestMailSummary：处理NextRequest邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest邮件摘要相关状态。
 */

    async handleNextRequestMailSummary(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.gatewayClientEmitHelper.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_SUMMARY_FAILED', error);
        }
    }    
    /**
 * handleNextRequestMailPage：处理NextRequest邮件Page并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest邮件Page相关状态。
 */

    async handleNextRequestMailPage(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const page = await this.gateway.mailRuntimeService.getPage(playerId, payload?.page, payload?.pageSize, payload?.filter);
            this.gateway.gatewayClientEmitHelper.emitNextMailPage(client, page);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_PAGE_FAILED', error);
        }
    }    
    /**
 * handleNextRequestMailDetail：处理NextRequest邮件详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest邮件详情相关状态。
 */

    async handleNextRequestMailDetail(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const detail = await this.gateway.mailRuntimeService.getDetail(playerId, payload?.mailId ?? '');
            this.gateway.gatewayClientEmitHelper.emitNextMailDetail(client, detail);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_DETAIL_FAILED', error);
        }
    }    
    /**
 * handleNextMarkMailRead：读取NextMark邮件Read并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextMark邮件Read相关状态。
 */

    async handleNextMarkMailRead(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.gateway.mailRuntimeService.markRead(playerId, payload?.mailIds ?? []);
            this.gateway.gatewayClientEmitHelper.emitNextMailOperationResult(client, response);
            await this.gateway.gatewayClientEmitHelper.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MARK_MAIL_READ_FAILED', error);
        }
    }    
    /**
 * handleNextClaimMailAttachments：处理NextClaim邮件Attachment并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextClaim邮件Attachment相关状态。
 */

    async handleNextClaimMailAttachments(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.gateway.mailRuntimeService.claimAttachments(playerId, payload?.mailIds ?? []);
            this.gateway.gatewayClientEmitHelper.emitNextMailOperationResult(client, response);
            await this.gateway.gatewayClientEmitHelper.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CLAIM_MAIL_ATTACHMENTS_FAILED', error);
        }
    }    
    /**
 * handleNextDeleteMail：处理NextDelete邮件并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDelete邮件相关状态。
 */

    async handleNextDeleteMail(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.gateway.mailRuntimeService.deleteMails(playerId, payload?.mailIds ?? []);
            this.gateway.gatewayClientEmitHelper.emitNextMailOperationResult(client, response);
            await this.gateway.gatewayClientEmitHelper.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DELETE_MAIL_FAILED', error);
        }
    }
}
exports.WorldGatewayMailHelper = WorldGatewayMailHelper;

export { WorldGatewayMailHelper };
