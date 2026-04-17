"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMailHelper = void 0;

/** 世界 socket 邮件 helper：只收敛 mail 相关入口。 */
class WorldGatewayMailHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    async handleNextRequestMailSummary(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_SUMMARY_FAILED', error);
        }
    }
    async handleNextRequestMailPage(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const page = await this.gateway.mailRuntimeService.getPage(playerId, payload?.page, payload?.pageSize, payload?.filter);
            this.gateway.emitNextMailPage(client, page);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_PAGE_FAILED', error);
        }
    }
    async handleNextRequestMailDetail(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const detail = await this.gateway.mailRuntimeService.getDetail(playerId, payload?.mailId ?? '');
            this.gateway.emitNextMailDetail(client, detail);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MAIL_DETAIL_FAILED', error);
        }
    }
    async handleNextMarkMailRead(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.gateway.mailRuntimeService.markRead(playerId, payload?.mailIds ?? []);
            this.gateway.emitNextMailOperationResult(client, response);
            await this.gateway.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MARK_MAIL_READ_FAILED', error);
        }
    }
    async handleNextClaimMailAttachments(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.gateway.mailRuntimeService.claimAttachments(playerId, payload?.mailIds ?? []);
            this.gateway.emitNextMailOperationResult(client, response);
            await this.gateway.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CLAIM_MAIL_ATTACHMENTS_FAILED', error);
        }
    }
    async handleNextDeleteMail(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = await this.gateway.mailRuntimeService.deleteMails(playerId, payload?.mailIds ?? []);
            this.gateway.emitNextMailOperationResult(client, response);
            await this.gateway.emitNextMailSummaryForPlayer(client, playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DELETE_MAIL_FAILED', error);
        }
    }
}
exports.WorldGatewayMailHelper = WorldGatewayMailHelper;
