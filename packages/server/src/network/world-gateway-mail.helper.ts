// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMailHelper = void 0;

/** 世界 socket 邮件 helper：只收敛 mail 相关入口。 */
class WorldGatewayMailHelper {
/**
 * gateway：WorldGatewayMailHelper 内部字段。
 */

    gateway;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * handleNextRequestMailSummary：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
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
 * handleNextRequestMailPage：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextRequestMailDetail：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextMarkMailRead：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextClaimMailAttachments：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextDeleteMail：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
