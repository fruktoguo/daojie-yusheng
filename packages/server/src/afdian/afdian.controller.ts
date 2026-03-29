import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AfdianConfigStatus,
  AfdianOrderListResponse,
  AfdianSyncOrdersRequest,
  AfdianSyncOrdersResponse,
  GmAfdianConfigRes,
  GmUpdateAfdianConfigReq,
} from '@mud/shared';
import { GmAuthGuard } from '../game/gm-auth.guard';
import { AfdianService } from './afdian.service';

interface AfdianWebhookAck {
  ec: number;
  em: string;
}

@Controller()
export class AfdianController {
  private readonly logger = new Logger(AfdianController.name);

  constructor(private readonly afdianService: AfdianService) {}

  @Post('integrations/afdian/webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: unknown): Promise<AfdianWebhookAck> {
    try {
      await this.afdianService.handleWebhook(body);
      return { ec: 200, em: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`爱发电 webhook 处理失败: ${message}`);
      return { ec: 500, em: message };
    }
  }
}

@Controller('gm/afdian')
@UseGuards(GmAuthGuard)
export class AfdianLegacyGmController {
  constructor(private readonly afdianService: AfdianService) {}

  @Get('config')
  getConfig(): GmAfdianConfigRes {
    return {
      config: this.afdianService.getConfigForm(),
      status: this.afdianService.getConfigStatus(),
    };
  }

  @Put('config')
  updateConfig(@Body() body: GmUpdateAfdianConfigReq): Promise<GmAfdianConfigRes> {
    return this.afdianService.saveConfig(body);
  }

  @Get('orders')
  listOrders(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('planId') planId?: string,
  ): Promise<AfdianOrderListResponse> {
    return this.afdianService.listStoredOrders({
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
      status: status === undefined ? undefined : Number(status),
      userId,
      planId,
    });
  }

  @Post('orders/sync')
  syncOrders(@Body() body: AfdianSyncOrdersRequest | undefined): Promise<AfdianSyncOrdersResponse> {
    return this.afdianService.syncOrders(body ?? {});
  }

  @Post('ping')
  pingApi(): Promise<AfdianConfigStatus & { reachable: boolean }> {
    return this.afdianService.pingApi();
  }
}

@Controller('gm/v2/afdian')
@UseGuards(GmAuthGuard)
export class AfdianGmController {
  constructor(private readonly afdianService: AfdianService) {}

  @Get('status')
  getStatus(): AfdianConfigStatus {
    return this.afdianService.getConfigStatus();
  }

  @Get('orders')
  listOrders(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('planId') planId?: string,
  ): Promise<AfdianOrderListResponse> {
    return this.afdianService.listStoredOrders({
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
      status: status === undefined ? undefined : Number(status),
      userId,
      planId,
    });
  }

  @Post('orders/sync')
  syncOrders(@Body() body: AfdianSyncOrdersRequest | undefined): Promise<AfdianSyncOrdersResponse> {
    return this.afdianService.syncOrders(body ?? {});
  }

  @Post('ping')
  pingApi(): Promise<AfdianConfigStatus & { reachable: boolean }> {
    return this.afdianService.pingApi();
  }
}
