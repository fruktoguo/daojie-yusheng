/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 主控制器。
 * 提供世界状态查询、玩家管理、地图实例操作、邮件、兑换码、
 * 性能计数器重置等 GM 面板所需的全部 HTTP 端点。所有路由需 GM 鉴权。
 */
import { BadRequestException, Body, Controller, Delete, Get, Inject, Optional, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { type GmActivatePlayerEternalBenefitReq, type GmBanManagedPlayerReq, type GmCreateCustomTechniqueReq, type GmCreateWorldInstanceReq, type GmGeneratedTechniqueListQuery, type GmListPlayersQuery, type GmPreviewCustomTechniqueReq, type GmSetPlayerMonthCardPoolReq, type GmTechniqueGenerationJobListQuery, type GmTransferPlayerToInstanceReq } from '@mud/shared';

import { RedeemCodeRuntimeService } from '../../runtime/redeem/redeem-code-runtime.service';
import {
  GmRuntimeFlagPersistenceService,
  GM_NETWORK_PAYLOAD_CAPTURE_FLAG_KEY,
  GM_RUNTIME_MAINTENANCE_FLAG_KEY,
} from '../../persistence/gm-runtime-flag-persistence.service';
import { GmConfigPersistenceService } from '../../persistence/gm-config-persistence.service';
import { GmAuditLogPersistenceService } from '../../persistence/gm-audit-log-persistence.service';
import { listGameConfigDescriptors, getGameConfigDescriptor } from '../../config/game-config-registry';
import { GM_HIGH_RISK_CONFIRMATION_CONTRACT, GM_HTTP_CONTRACT } from './native-gm-contract';
import { extractGmActor } from './native-gm-actor-context';
import { assertGmHighRiskOperationAllowed, type GmHighRiskConfirmationBody } from './native-gm-high-risk';
import { NativeGmAuthGuard } from './native-gm-auth.guard';
import { NativeGmGeneratedTechniqueService } from './native-gm-generated-technique.service';
import { NativeGmMailService } from './native-gm-mail.service';
import { NativeGmMarketTradeService } from './native-gm-market-trade.service';
import { NativeGmPlayerService } from './native-gm-player.service';
import { NativeGmWorldService } from './native-gm-world.service';
import { NativeManagedAccountService } from './native-managed-account.service';
import { AiArtsStrengthV1ToV2Conversion } from '../../gm/compat-conversions/conversions/technique/ai-arts-strength-v1-to-v2';
import { ZeroPublishedGeneratedTechniqueChantConversion } from '../../gm/compat-conversions/conversions/technique/zero-published-generated-technique-chant';
import { DeleteEmptyCustomTechniqueBooksConversion } from '../../gm/compat-conversions/conversions/technique/delete-empty-custom-technique-books';
import { RecoverEmptyCustomTechniqueBooksConversion } from '../../gm/compat-conversions/conversions/technique/recover-empty-custom-technique-books';
import { OrphanSectBuildingVisualsConversion } from '../../gm/compat-conversions/conversions/building/orphan-sect-building-visuals';
import { TongtianTowerCatalogInstanceTypeConversion } from '../../gm/compat-conversions/conversions/world/tongtian-tower-catalog-instance-type';
/**
 * UpdatePlayerPasswordBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerPasswordBody {
/**
 * newPassword：newPassword相关字段。
 */

  newPassword?: string;
  /**
 * password：password相关字段。
 */

  password?: string;
}
/**
 * UpdatePlayerAccountBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerAccountBody {
/**
 * username：username名称或显示文本。
 */

  username?: string;
}
/**
 * UpdatePlayerBody：定义接口结构约束，明确可交付字段含义。
 */


interface UpdatePlayerBody {
/**
 * section：section相关字段。
 */

  section?: unknown;
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot?: unknown;
}
/**
 * SetPlayerBodyTrainingLevelBody：定义接口结构约束，明确可交付字段含义。
 */


interface SetPlayerBodyTrainingLevelBody {
/**
 * level：等级数值。
 */

  level?: number;
}
/**
 * AddPlayerCounterBody：定义接口结构约束，明确可交付字段含义。
 */


interface AddPlayerCounterBody {
/**
 * amount：数量或计量字段。
 */

  amount?: number;
}

interface SetPlayerMonthCardPoolBody extends Partial<GmSetPlayerMonthCardPoolReq> {}

interface ActivatePlayerEternalBenefitBody extends Partial<GmActivatePlayerEternalBenefitReq> {}
/**
 * SpawnBotsBody：定义接口结构约束，明确可交付字段含义。
 */


interface SpawnBotsBody {
/**
 * anchorPlayerId：anchor玩家ID标识。
 */

  anchorPlayerId?: string;
  /**
 * count：数量或计量字段。
 */

  count?: number;
}
/**
 * RemoveBotsBody：定义接口结构约束，明确可交付字段含义。
 */


interface RemoveBotsBody {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * all：all相关字段。
 */

  all?: boolean;
}
/**
 * GmPlayerScopeBody：可选玩家范围；为空时保持 GM 快捷操作的全员语义。
 */


interface GmPlayerScopeBody {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];
  /**
 * targetPlayerIds：目标玩家ID相关字段。
 */

  targetPlayerIds?: string[];
}
/**
 * DirectMailBody：定义接口结构约束，明确可交付字段含义。
 */


interface DirectMailBody {
  [key: string]: unknown;
}
/**
 * BroadcastMailBody：定义接口结构约束，明确可交付字段含义。
 */


interface BroadcastMailBody {
  [key: string]: unknown;
}

type RestartServerBody = GmHighRiskConfirmationBody;
/**
 * RedeemCodeGroupBody：定义接口结构约束，明确可交付字段含义。
 */


interface RedeemCodeGroupBody {
/**
 * name：名称名称或显示文本。
 */

  name?: string;
  /**
 * rewards：reward相关字段。
 */

  rewards?: unknown[];
  /**
 * count：数量或计量字段。
 */

  count?: unknown;
}
/**
 * MapConfigBody：定义接口结构约束，明确可交付字段含义。
 */


interface MapConfigBody {
  [key: string]: unknown;
}

interface SetMaintenanceBody {
/**
 * active：是否开启维护中。
 */

  active?: boolean;
}

interface RuntimeFlagBody {
  value?: boolean;
}

interface ZeroPublishedGeneratedTechniqueChantApplyBody {
  expectedTargetFingerprint?: string;
  expectedMatchedRows?: number;
}

interface NodeMigrationBody {
  targetNodeId?: string;
}

let restartRequestedAt: string | null = null;
/**
 * RedeemCodeRuntimeServicePort：定义接口结构约束，明确可交付字段含义。
 */


interface RedeemCodeRuntimeServicePort {
  listGroups(): unknown;
  createGroup(name: string, rewards: unknown[], count: number): Promise<unknown>;
  getGroupDetail(groupId: string): Promise<unknown>;
  updateGroup(groupId: string, name: string, rewards: unknown[]): Promise<unknown>;
  deleteGroup(groupId: string): Promise<unknown>;
  appendCodes(groupId: string, count: number): Promise<unknown>;
  destroyCode(codeId: string): Promise<unknown>;
}
/**
 * NativeGmController：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Controller(GM_HTTP_CONTRACT.gmBasePath)
@UseGuards(NativeGmAuthGuard)
export class NativeGmController {
/**
 * redeemCodeRuntimeService：redeemCode运行态服务引用。
 */

  private readonly redeemCodeRuntimeService: RedeemCodeRuntimeServicePort;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextGmWorldService NativeGmWorldService 参数说明。
 * @param nextManagedAccountService NativeManagedAccountService 参数说明。
 * @param nextGmPlayerService NativeGmPlayerService 参数说明。
 * @param nextGmMailService NativeGmMailService 参数说明。
 * @param redeemCodeRuntimeService RedeemCodeRuntimeServicePort 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    private readonly nextGmWorldService: NativeGmWorldService,
    private readonly nextManagedAccountService: NativeManagedAccountService,
    private readonly nextGmPlayerService: NativeGmPlayerService,
    private readonly nextGmMailService: NativeGmMailService,
    @Inject(RedeemCodeRuntimeService) redeemCodeRuntimeService: RedeemCodeRuntimeServicePort,
    @Inject(GmRuntimeFlagPersistenceService) private readonly runtimeFlagService: GmRuntimeFlagPersistenceService,
    @Inject(GmConfigPersistenceService) private readonly gmConfigService: GmConfigPersistenceService,
    @Inject(NativeGmGeneratedTechniqueService) private readonly nextGmGeneratedTechniqueService: NativeGmGeneratedTechniqueService,
    @Inject(NativeGmMarketTradeService) private readonly nextGmMarketTradeService: NativeGmMarketTradeService,
    @Inject(AiArtsStrengthV1ToV2Conversion) private readonly aiArtsStrengthV1ToV2Conversion: AiArtsStrengthV1ToV2Conversion,
    @Inject(ZeroPublishedGeneratedTechniqueChantConversion) private readonly zeroPublishedGeneratedTechniqueChantConversion: ZeroPublishedGeneratedTechniqueChantConversion,
    @Inject(RecoverEmptyCustomTechniqueBooksConversion) private readonly recoverEmptyCustomTechniqueBooksConversion: RecoverEmptyCustomTechniqueBooksConversion,
    @Inject(DeleteEmptyCustomTechniqueBooksConversion) private readonly deleteEmptyCustomTechniqueBooksConversion: DeleteEmptyCustomTechniqueBooksConversion,
    @Inject(OrphanSectBuildingVisualsConversion) private readonly orphanSectBuildingVisualsConversion: OrphanSectBuildingVisualsConversion,
    @Inject(TongtianTowerCatalogInstanceTypeConversion) private readonly tongtianTowerCatalogInstanceTypeConversion: TongtianTowerCatalogInstanceTypeConversion,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,

  ) {
    this.redeemCodeRuntimeService = redeemCodeRuntimeService;
  }
  /**
 * getState：读取状态。
 * @returns 无返回值，完成状态的读取/组装。
 */


  @Get('state')
  async getState(@Query() query: GmListPlayersQuery) {
    const state = await this.nextGmWorldService.getState(query) as Record<string, unknown>;
    return {
      ...state,
      operations: {
        maintenanceActive: this.runtimeFlagService.getFlag(GM_RUNTIME_MAINTENANCE_FLAG_KEY),
        restartRequested: restartRequestedAt !== null,
      },
    };
  }

  @Get('players')
  async listPlayers(@Query() query: GmListPlayersQuery) {
    return this.nextGmWorldService.listPlayers(query);
  }

  @Get('generated-techniques')
  listGeneratedTechniques(@Query() query: GmGeneratedTechniqueListQuery) {
    return this.nextGmGeneratedTechniqueService.listGeneratedTechniques(query);
  }

  @Post('generated-techniques/preview')
  previewCustomTechnique(@Body() body: GmPreviewCustomTechniqueReq) {
    return this.nextGmGeneratedTechniqueService.previewCustomTechnique(body);
  }

  @Post('generated-techniques')
  async createCustomTechnique(
    @Body() body: GmCreateCustomTechniqueReq,
    @Req() request: unknown,
  ) {
    return this.executeAuditedGmWrite({
      op: 'gm.generated_techniques.create',
      request,
      targetType: 'generated_technique',
      targetId: typeof body?.operationId === 'string' ? body.operationId.trim() : null,
      after: (result) => ({
        techniqueId: result.techniqueId,
        created: result.created,
        name: result.preview.template.name,
      }),
    }, async () => this.nextGmGeneratedTechniqueService.createCustomTechnique(body));
  }

  @Get('generated-techniques/:id')
  getGeneratedTechnique(@Param('id') id: string) {
    return this.nextGmGeneratedTechniqueService.getGeneratedTechnique(id);
  }

  @Get('technique-generation/jobs')
  listTechniqueGenerationJobs(@Query() query: GmTechniqueGenerationJobListQuery) {
    return this.nextGmGeneratedTechniqueService.listGenerationJobs(query);
  }

  @Get('technique-generation/jobs/:id')
  getTechniqueGenerationJob(@Param('id') id: string) {
    return this.nextGmGeneratedTechniqueService.getGenerationJob(id);
  }
  /**
 * getWorldSummary：读取世界运行态摘要。
 * @returns 无返回值，完成世界运行态摘要的读取/组装。
 */


  @Get('world/summary')
  getWorldSummary() {
    return this.nextGmWorldService.getRuntimeSummary();
  }

  @Get('world/objects')
  getWorldObjects() {
    return this.nextGmWorldService.getObjectCounts();
  }
  /**
 * getWorldDirtyBacklog：读取世界脏积压。
 * @returns 无返回值，完成世界脏积压的读取/组装。
 */


  @Get('world/dirty-backlog')
  getWorldDirtyBacklog() {
    const summary = this.nextGmWorldService.getRuntimeSummary();
    return typeof summary === 'object' && summary !== null ? (summary as { dirtyBacklog?: unknown }).dirtyBacklog ?? null : null;
  }
  /**
 * getWorldNodes：读取节点列表与健康状态。
 * @returns 无返回值，完成节点列表与健康状态的读取/组装。
 */


  @Get('world/nodes')
  getWorldNodes() {
    return this.nextGmWorldService.getNodeRegistryHealth();
  }
  /**
 * getWorldOutboxRetryQueue：读取失败重试队列。
 * @returns 无返回值，完成失败重试队列的读取/组装。
 */


  @Get('world/outbox/retry-queue')
  getWorldOutboxRetryQueue() {
    return this.nextGmWorldService.getOutboxRetryQueue();
  }
  /**
 * replayWorldOperation：重放单个 operation_id。
 * @param operationId string operation ID。
 * @returns 无返回值，完成 operation replay 的读取/组装。
 */


  @Get('world/operations/:operationId/replay')
  replayWorldOperation(@Param('operationId') operationId: string) {
    return this.nextGmWorldService.replayOperation(operationId);
  }
  /**
 * freezeWorldInstanceWriting：冻结实例写入。
 * @param instanceId string 实例 ID。
 * @returns 无返回值，完成实例写入冻结。
 */


  @Post('world/instances/:instanceId/freeze')
  freezeWorldInstanceWriting(@Param('instanceId') instanceId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.freeze',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
    }, () => {
      this.nextGmWorldService.freezeInstanceWriting(instanceId);
      return { ok: true };
    });
  }
  /**
 * unfreezeWorldInstanceWriting：解冻实例写入。
 * @param instanceId string 实例 ID。
 * @returns 无返回值，完成实例写入解冻。
 */


  @Post('world/instances/:instanceId/unfreeze')
  unfreezeWorldInstanceWriting(@Param('instanceId') instanceId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.unfreeze',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
    }, () => this.nextGmWorldService.unfreezeInstanceWriting(instanceId));
  }
  /**
 * getWorldInstanceLease：读取实例 lease / owner。
 * @param instanceId string 实例 ID。
 * @returns 无返回值，完成实例 lease / owner 的读取/组装。
 */


  @Get('world/instances/:instanceId/lease')
  getWorldInstanceLease(@Param('instanceId') instanceId: string) {
    return this.nextGmWorldService.getInstanceLeaseStatus(instanceId);
  }
  /**
 * flushWorldPlayer：强制刷单玩家。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，完成单玩家刷盘。
 */


  @Post('world/players/:playerId/flush')
  flushWorldPlayer(@Param('playerId') playerId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.players.flush',
      request,
      targetType: 'player',
      targetId: playerId,
    }, () => this.nextGmWorldService.flushPlayerPersistence(playerId));
  }
  /**
 * flushWorldInstance：强制刷单实例。
 * @param instanceId string 实例 ID。
 * @returns 无返回值，完成单实例刷盘。
 */


  @Post('world/instances/:instanceId/flush')
  flushWorldInstance(@Param('instanceId') instanceId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.flush',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
    }, () => this.nextGmWorldService.flushInstancePersistence(instanceId));
  }
  /**
 * rebuildWorldInstance：强制重建某实例。
 * @param instanceId string 实例 ID。
 * @returns 无返回值，完成单实例重建。
 */


  @Post('world/instances/:instanceId/rebuild')
  rebuildWorldInstance(@Param('instanceId') instanceId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.rebuild',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
    }, () => this.nextGmWorldService.rebuildPersistentInstance(instanceId));
  }
  /**
 * migrateWorldInstance：手动迁移实例到指定节点。
 * @param instanceId string 实例 ID。
 * @param body NodeMigrationBody 参数说明。
 * @returns 无返回值，完成实例节点迁移。
 */


  @Post('world/instances/:instanceId/migrate')
  migrateWorldInstance(@Param('instanceId') instanceId: string, @Body() body: NodeMigrationBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.migrate',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
      after: { targetNodeId: typeof body?.targetNodeId === 'string' ? body.targetNodeId.trim() : '' },
    }, () => {
      const targetNodeId = typeof body?.targetNodeId === 'string' ? body.targetNodeId.trim() : '';
      if (!targetNodeId) {
        throw new BadRequestException('目标节点 ID 不能为空');
      }
      return this.nextGmWorldService.migrateInstanceToNode(instanceId, targetNodeId);
    });
  }
  /**
 * migrateWorldPlayer：手动迁移玩家到指定节点。
 * @param playerId string 玩家 ID。
 * @param body NodeMigrationBody 参数说明。
 * @returns 无返回值，完成玩家节点迁移。
 */


  @Post('world/players/:playerId/migrate')
  migrateWorldPlayer(@Param('playerId') playerId: string, @Body() body: NodeMigrationBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.players.migrate',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { targetNodeId: typeof body?.targetNodeId === 'string' ? body.targetNodeId.trim() : '' },
    }, () => {
      const targetNodeId = typeof body?.targetNodeId === 'string' ? body.targetNodeId.trim() : '';
      if (!targetNodeId) {
        throw new BadRequestException('目标节点 ID 不能为空');
      }
      return this.nextGmWorldService.migratePlayerToNode(playerId, targetNodeId);
    });
  }
  /**
 * getEditorCatalog：读取Editor目录。
 * @returns 无返回值，完成Editor目录的读取/组装。
 */


  @Get('editor-catalog')
  getEditorCatalog() {
    return this.nextGmWorldService.getEditorCatalog();
  }
  /**
 * getMaps：读取地图。
 * @returns 无返回值，完成地图的读取/组装。
 */


  @Get('maps')
  getMaps() {
    return this.nextGmWorldService.getMaps();
  }
  /**
 * getMapRuntime：读取和平公共线兼容运行态。
 * @param mapId string 地图 ID。
 * @param qx string 参数说明。
 * @param qy string 参数说明。
 * @param qw string 参数说明。
 * @param qh string 参数说明。
 * @param viewerId string viewer ID。
 * @returns 无返回值，完成和平公共线兼容运行态的读取/组装。
 */


  @Get('maps/:mapId/runtime')
  getMapRuntime(
    @Param('mapId') mapId: string,
    @Query('x') qx: string,
    @Query('y') qy: string,
    @Query('w') qw: string,
    @Query('h') qh: string,
    @Query('viewerId') viewerId: string,
  ) {
    return this.nextGmWorldService.getMapRuntime(mapId, qx, qy, qw, qh, viewerId);
  }
  /**
 * getWorldInstances：读取实例列表。
 * @returns 无返回值，完成实例列表的读取/组装。
 */


  @Get('world/instances')
  getWorldInstances() {
    return this.nextGmWorldService.getWorldInstances();
  }
  /**
 * getWorldInstanceRuntime：读取实例运行态。
 * @param instanceId string 实例 ID。
 * @param qx string 参数说明。
 * @param qy string 参数说明。
 * @param qw string 参数说明。
 * @param qh string 参数说明。
 * @param viewerId string viewer ID。
 * @returns 无返回值，完成实例运行态的读取/组装。
 */


  @Get('world/instances/:instanceId/runtime')
  getWorldInstanceRuntime(
    @Param('instanceId') instanceId: string,
    @Query('x') qx: string,
    @Query('y') qy: string,
    @Query('w') qw: string,
    @Query('h') qh: string,
    @Query('viewerId') viewerId: string,
  ) {
    return this.nextGmWorldService.getWorldInstanceRuntime(instanceId, qx, qy, qw, qh, viewerId);
  }

  @Get('world/instances/:instanceId/buildings')
  getWorldInstanceBuildings(@Param('instanceId') instanceId: string) {
    return this.nextGmWorldService.getWorldInstanceBuildingState(instanceId);
  }

  @Delete('world/instances/:instanceId/buildings/:buildingId')
  destroyWorldInstanceBuilding(
    @Param('instanceId') instanceId: string,
    @Param('buildingId') buildingId: string,
    @Req() request: unknown,
  ) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.buildings.destroy',
      request,
      targetType: 'world_building',
      targetId: `${instanceId}/${buildingId}`,
    }, () => this.nextGmWorldService.destroyWorldInstanceBuilding(instanceId, buildingId));
  }

  @Delete('world/instances/:instanceId')
  destroyWorldInstance(@Param('instanceId') instanceId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.destroy',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
    }, () => this.nextGmWorldService.destroyWorldInstance(instanceId));
  }

  @Get('world/instances/:instanceId/rooms')
  getWorldInstanceRooms(@Param('instanceId') instanceId: string) {
    return this.nextGmWorldService.getWorldInstanceBuildingState(instanceId);
  }

  @Get('world/instances/:instanceId/fengshui')
  getWorldInstanceFengShui(@Param('instanceId') instanceId: string) {
    return this.nextGmWorldService.getWorldInstanceBuildingState(instanceId);
  }

  @Get('world/instances/:instanceId/building-cell')
  getWorldInstanceBuildingCell(
    @Param('instanceId') instanceId: string,
    @Query('x') x: string,
    @Query('y') y: string,
  ) {
    return this.nextGmWorldService.getWorldInstanceBuildingCellState(instanceId, x, y);
  }

  @Get('world/building-audit')
  getWorldBuildingAudit(@Query('limit') limit: string) {
    return this.nextGmWorldService.getWorldBuildingOperationAudit(limit);
  }

  @Post('world/instances/:instanceId/recalculate-building-fengshui')
  recalculateWorldInstanceBuildingFengShui(@Param('instanceId') instanceId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.building_fengshui.recalculate',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
    }, () => this.nextGmWorldService.recalculateWorldInstanceBuildingState(instanceId));
  }

  @Post('world/instances/:instanceId/repair-building-fengshui')
  repairWorldInstanceBuildingFengShui(@Param('instanceId') instanceId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.building_fengshui.repair',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
    }, () => this.nextGmWorldService.repairWorldInstanceBuildingState(instanceId));
  }

  /**
 * createWorldInstance：创建手动实例。
 * @param body GmCreateWorldInstanceReq 参数说明。
 * @returns 无返回值，完成手动实例创建。
 */


  @Post('world/instances')
  createWorldInstance(@Body() body: GmCreateWorldInstanceReq, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.create',
      request,
      targetType: 'world_instance',
      targetId: typeof body?.templateId === 'string' ? body.templateId : null,
      after: (result) => ({
        templateId: body?.templateId ?? null,
        linePreset: body?.linePreset ?? null,
        instanceId: result?.instance?.instanceId ?? null,
      }),
    }, () => this.nextGmWorldService.createWorldInstance(body));
  }
  /**
 * transferPlayerToInstance：迁移玩家到指定实例。
 * @param body GmTransferPlayerToInstanceReq 参数说明。
 * @returns 无返回值，完成玩家实例迁移。
 */


  @Post('world/instances/transfer-player')
  transferPlayerToInstance(@Body() body: GmTransferPlayerToInstanceReq, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world.instances.transfer_player',
      request,
      targetType: 'player',
      targetId: body?.playerId ?? null,
      after: { playerId: body?.playerId ?? null, instanceId: body?.instanceId ?? null },
    }, () => this.nextGmWorldService.transferPlayerToInstance(body));
  }
  /**
 * getPlayer：读取玩家。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */


  @Get('players/:playerId')
  async getPlayer(@Param('playerId') playerId: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = await this.nextGmPlayerService.getPlayerDetail(playerId);
    if (!player) {
      throw new BadRequestException('目标玩家不存在');
    }
    return player;
  }
  /**
 * updatePlayerPassword：处理玩家Password并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerPasswordBody 参数说明。
 * @returns 无返回值，直接更新玩家Password相关状态。
 */


  @Post('players/:playerId/password')
  async updatePlayerPassword(@Param('playerId') playerId: string, @Body() body: UpdatePlayerPasswordBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.password.update',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { passwordProvided: typeof body?.newPassword === 'string' || typeof body?.password === 'string' },
    }, async () => {
      const rawPassword = typeof body?.newPassword === 'string'
        ? body.newPassword
        : typeof body?.password === 'string'
          ? body.password
          : '';
      const nextPassword = rawPassword.trim();
      if (!nextPassword) {
        throw new BadRequestException('新密码不能为空');
      }
      await this.nextManagedAccountService.updateManagedPlayerPassword(playerId, nextPassword);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * updatePlayerAccount：处理玩家Account并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerAccountBody 参数说明。
 * @returns 无返回值，直接更新玩家Account相关状态。
 */


  @Put('players/:playerId/account')
  async updatePlayerAccount(@Param('playerId') playerId: string, @Body() body: UpdatePlayerAccountBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.account.update',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { username: body?.username ?? '' },
    }, async () => {
      await this.nextManagedAccountService.updateManagedPlayerAccount(playerId, body?.username ?? '');
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * banPlayerAccount：封禁玩家账号。
 * @param playerId string 玩家 ID。
 * @param body GmBanManagedPlayerReq 参数说明。
 * @returns 返回操作结果。
 */


  @Post('players/:playerId/ban')
  async banPlayerAccount(@Param('playerId') playerId: string, @Body() body: GmBanManagedPlayerReq, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.account.ban',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { reasonLength: typeof body?.reason === 'string' ? body.reason.length : 0 },
    }, async () => {
      await this.nextManagedAccountService.banManagedPlayerAccount(playerId, body?.reason ?? '');
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }

  /**
 * unbanPlayerAccount：解封玩家账号。
 * @param playerId string 玩家 ID。
 * @returns 返回操作结果。
 */


  @Post('players/:playerId/unban')
  async unbanPlayerAccount(@Param('playerId') playerId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.account.unban',
      request,
      targetType: 'player',
      targetId: playerId,
    }, async () => {
      await this.nextManagedAccountService.unbanManagedPlayerAccount(playerId);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }

  /**
 * updatePlayer：处理玩家并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body UpdatePlayerBody 参数说明。
 * @returns 无返回值，直接更新玩家相关状态。
 */


  @Put('players/:playerId')
  async updatePlayer(@Param('playerId') playerId: string, @Body() body: UpdatePlayerBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.update',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { changedFields: Object.keys(body ?? {}) },
    }, async (actor) => {
      await this.nextGmPlayerService.updatePlayer(playerId, body ?? {}, actor);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * resetPlayer：执行reset玩家相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新reset玩家相关状态。
 */


  @Post('players/:playerId/reset')
  async resetPlayer(@Param('playerId') playerId: string, @Req() request: unknown) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return this.executeAuditedGmWrite({
      op: 'gm.players.reset',
      request,
      targetType: 'player',
      targetId: playerId,
    }, async (actor) => {
      if (this.nextGmPlayerService.hasRuntimePlayer(playerId)) {
        this.nextGmPlayerService.resetPlayer(playerId);
      } else {
        await this.nextGmPlayerService.resetPersistedPlayer(playerId, actor);
      }
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * setPlayerBodyTrainingLevel：设置玩家炼体等级。
 * @param playerId string 玩家 ID。
 * @param body SetPlayerBodyTrainingLevelBody 参数说明。
 * @returns 无返回值，直接更新玩家炼体等级相关状态。
 */


  @Post('players/:playerId/body-training/level')
  async setPlayerBodyTrainingLevel(@Param('playerId') playerId: string, @Body() body: SetPlayerBodyTrainingLevelBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.body_training.level.set',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { level: body?.level ?? null },
    }, async (actor) => {
      await this.nextGmPlayerService.setPlayerBodyTrainingLevel(playerId, body?.level, actor);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * addPlayerFoundation：调整玩家底蕴。
 * @param playerId string 玩家 ID。
 * @param body AddPlayerCounterBody 参数说明。
 * @returns 无返回值，直接更新玩家底蕴相关状态。
 */


  @Post('players/:playerId/foundation/add')
  async addPlayerFoundation(@Param('playerId') playerId: string, @Body() body: AddPlayerCounterBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.foundation.add',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { amount: body?.amount ?? null },
    }, async (actor) => {
      await this.nextGmPlayerService.addPlayerFoundation(playerId, body?.amount, actor);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * addPlayerCombatExp：调整玩家战斗经验。
 * @param playerId string 玩家 ID。
 * @param body AddPlayerCounterBody 参数说明。
 * @returns 无返回值，直接更新玩家战斗经验相关状态。
 */


  @Post('players/:playerId/combat-exp/add')
  async addPlayerCombatExp(@Param('playerId') playerId: string, @Body() body: AddPlayerCounterBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.combat_exp.add',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { amount: body?.amount ?? null },
    }, async (actor) => {
      await this.nextGmPlayerService.addPlayerCombatExp(playerId, body?.amount, actor);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }

  @Post('players/:playerId/month-card/pool')
  async setPlayerMonthCardPool(@Param('playerId') playerId: string, @Body() body: SetPlayerMonthCardPoolBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.month_card.pool.set',
      request,
      targetType: 'player',
      targetId: playerId,
      after: {
        totalPoolMerit: body?.totalPoolMerit ?? null,
        remainingPoolMerit: body?.remainingPoolMerit ?? null,
        eternalEnabled: body?.eternalEnabled ?? null,
        dailySignInFixedMeritBonus: body?.dailySignInFixedMeritBonus ?? null,
      },
    }, async (actor) => {
      await this.nextGmPlayerService.setPlayerMonthCardPool(
        playerId,
        body?.totalPoolMerit,
        body?.remainingPoolMerit,
        body?.eternalEnabled,
        body?.dailySignInFixedMeritBonus,
        actor,
      );
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }

  @Post('players/:playerId/month-card/eternal/activate')
  async activatePlayerEternalBenefit(@Param('playerId') playerId: string, @Body() body: ActivatePlayerEternalBenefitBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.month_card.eternal.activate',
      request,
      targetType: 'player',
      targetId: playerId,
      after: { count: body?.count ?? null },
    }, async (actor) => {
      await this.nextGmPlayerService.activatePlayerEternalBenefit(
        playerId,
        body?.count,
        actor,
      );
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * resetHeavenGate：执行resetHeavenGate相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新resetHeavenGate相关状态。
 */


  @Post('players/:playerId/heaven-gate/reset')
  async resetHeavenGate(@Param('playerId') playerId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.players.heaven_gate.reset',
      request,
      targetType: 'player',
      targetId: playerId,
    }, async (actor) => {
      await this.nextGmPlayerService.resetHeavenGate(playerId, actor);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * spawnBots：执行spawnBot相关逻辑。
 * @param body SpawnBotsBody 参数说明。
 * @returns 无返回值，直接更新spawnBot相关状态。
 */


  @Post('bots/spawn')
  async spawnBots(@Body() body: SpawnBotsBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.bots.spawn',
      request,
      targetType: 'bot',
      targetId: body?.anchorPlayerId ?? null,
      after: { anchorPlayerId: body?.anchorPlayerId ?? '', count: body?.count ?? null },
    }, () => {
      this.nextGmPlayerService.spawnBots(body?.anchorPlayerId ?? '', body?.count);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * removeBots：处理Bot并更新相关状态。
 * @param body RemoveBotsBody 参数说明。
 * @returns 无返回值，直接更新Bot相关状态。
 */


  @Post('bots/remove')
  async removeBots(@Body() body: RemoveBotsBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.bots.remove',
      request,
      targetType: 'bot',
      targetId: body?.all === true ? 'all' : null,
      after: { playerIds: body?.playerIds ?? [], all: body?.all === true },
    }, () => {
      this.nextGmPlayerService.removeBots(body?.playerIds ?? [], body?.all ?? false);
      this.nextGmWorldService.invalidatePlayerListCaches();
      return { ok: true };
    });
  }
  /**
 * returnAllPlayersToDefaultSpawn：执行returnAll玩家To默认Spawn相关逻辑。
 * @returns 无返回值，直接更新returnAll玩家ToDefaultSpawn相关状态。
 */


  @Post('shortcuts/players/return-all-to-default-spawn')
  async returnAllPlayersToDefaultSpawn(@Body() body: GmPlayerScopeBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.players.return_all_to_default_spawn',
      request,
      targetType: 'player',
      targetId: 'scope',
      after: { playerIds: body?.playerIds ?? [], targetPlayerIds: body?.targetPlayerIds ?? [] },
    }, async () => {
      const result = await this.nextGmPlayerService.returnAllPlayersToDefaultSpawn(body ?? {});
      this.nextGmWorldService.invalidatePlayerListCaches();
      return result;
    });
  }
  /**
 * cleanupAllPlayersInvalidItems：清理全部非机器人的无效物品。
 * @returns 无返回值，直接更新全部无效物品清理相关状态。
 */


  @Post('shortcuts/players/cleanup-invalid-items')
  async cleanupAllPlayersInvalidItems(@Body() body: GmPlayerScopeBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.players.cleanup_invalid_items',
      request,
      targetType: 'player',
      targetId: 'scope',
      after: { playerIds: body?.playerIds ?? [], targetPlayerIds: body?.targetPlayerIds ?? [] },
    }, async () => {
      const result = await this.nextGmPlayerService.cleanupAllPlayersInvalidItems(body ?? {});
      this.nextGmWorldService.invalidatePlayerListCaches();
      return result;
    });
  }

  @Post('shortcuts/players/migrate-recovery-pills')
  async migrateAllPlayersRecoveryPills(@Body() body: GmPlayerScopeBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.players.migrate_recovery_pills',
      request,
      targetType: 'player',
      targetId: 'scope',
      after: { playerIds: body?.playerIds ?? [], targetPlayerIds: body?.targetPlayerIds ?? [] },
    }, async () => {
      const result = await this.nextGmPlayerService.migrateAllPlayersRecoveryPills(body ?? {});
      this.nextGmWorldService.invalidatePlayerListCaches();
      return result;
    });
  }

  @Post('shortcuts/maintenance/repair-market-storage-item-ids')
  async repairMarketStorageItemIds(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.maintenance.repair_market_storage_item_ids',
      request,
      targetType: 'maintenance',
      targetId: 'market_storage_item_ids',
    }, () => this.nextGmPlayerService.repairMarketStorageItemIds());
  }

  @Post('shortcuts/compat/quest-progress-payloads/dry-run')
  async dryRunRepairQuestProgressPayloads(@Req() request: unknown) {
    return this.nextGmPlayerService.repairQuestProgressPayloads('dry-run', extractGmActor(request));
  }

  @Post('shortcuts/compat/quest-progress-payloads/apply')
  async applyRepairQuestProgressPayloads(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compat.quest_progress_payloads.apply',
      request,
      targetType: 'compat_conversion',
      targetId: 'quest_progress_payloads',
    }, (actor) => this.nextGmPlayerService.repairQuestProgressPayloads('apply', actor));
  }

  @Post('shortcuts/players/refresh-online-technique-templates')
  async refreshOnlinePlayerTechniqueTemplates(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.players.refresh_online_technique_templates',
      request,
      targetType: 'player',
      targetId: 'online_technique_templates',
    }, () => this.nextGmPlayerService.refreshOnlinePlayerTechniqueTemplates());
  }

  @Post('shortcuts/compat/ai-arts-strength-v1-to-v2/dry-run')
  async dryRunAiArtsStrengthV1ToV2(@Req() request: unknown) {
    return this.aiArtsStrengthV1ToV2Conversion.run({
      mode: 'dry-run',
      actor: extractGmActor(request),
    });
  }

  @Post('shortcuts/compat/ai-arts-strength-v1-to-v2/apply')
  async applyAiArtsStrengthV1ToV2(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compat.ai_arts_strength_v1_to_v2.apply',
      request,
      targetType: 'compat_conversion',
      targetId: 'ai_arts_strength_v1_to_v2',
    }, (actor) => this.aiArtsStrengthV1ToV2Conversion.run({
      mode: 'apply',
      actor,
    }));
  }

  @Post('shortcuts/compat/generated-technique-chant-zero/dry-run')
  async dryRunZeroPublishedGeneratedTechniqueChant(@Req() request: unknown) {
    return this.zeroPublishedGeneratedTechniqueChantConversion.run({
      mode: 'dry-run',
      actor: extractGmActor(request),
    });
  }

  @Post('shortcuts/compat/generated-technique-chant-zero/apply')
  async applyZeroPublishedGeneratedTechniqueChant(
    @Body() body: ZeroPublishedGeneratedTechniqueChantApplyBody,
    @Req() request: unknown,
  ) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compat.generated_technique_chant_zero.apply',
      request,
      targetType: 'compat_conversion',
      targetId: 'zero_published_generated_technique_chant',
    }, (actor) => this.zeroPublishedGeneratedTechniqueChantConversion.run({
      mode: 'apply',
      actor,
      expectedTargetFingerprint: body?.expectedTargetFingerprint,
      expectedMatchedRows: body?.expectedMatchedRows,
    }));
  }

  @Post('shortcuts/compat/recover-empty-custom-technique-books/dry-run')
  async dryRunRecoverEmptyCustomTechniqueBooks(@Req() request: unknown) {
    return this.recoverEmptyCustomTechniqueBooksConversion.run({
      mode: 'dry-run',
      actor: extractGmActor(request),
    });
  }

  @Post('shortcuts/compat/recover-empty-custom-technique-books/apply')
  async applyRecoverEmptyCustomTechniqueBooks(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compat.recover_empty_custom_technique_books.apply',
      request,
      targetType: 'compat_conversion',
      targetId: 'recover_empty_custom_technique_books',
    }, (actor) => this.recoverEmptyCustomTechniqueBooksConversion.run({
      mode: 'apply',
      actor,
    }));
  }

  @Post('shortcuts/compat/delete-empty-custom-technique-books/dry-run')
  async dryRunDeleteEmptyCustomTechniqueBooks(@Req() request: unknown) {
    return this.deleteEmptyCustomTechniqueBooksConversion.run({
      mode: 'dry-run',
      actor: extractGmActor(request),
    });
  }

  @Post('shortcuts/compat/delete-empty-custom-technique-books/apply')
  async applyDeleteEmptyCustomTechniqueBooks(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compat.delete_empty_custom_technique_books.apply',
      request,
      targetType: 'compat_conversion',
      targetId: 'delete_empty_custom_technique_books',
    }, (actor) => this.deleteEmptyCustomTechniqueBooksConversion.run({
      mode: 'apply',
      actor,
    }));
  }

  @Post('shortcuts/compat/orphan-sect-building-visuals/dry-run')
  async dryRunOrphanSectBuildingVisuals(@Req() request: unknown) {
    return this.orphanSectBuildingVisualsConversion.run({
      mode: 'dry-run',
      actor: extractGmActor(request),
    });
  }

  @Post('shortcuts/compat/orphan-sect-building-visuals/apply')
  async applyOrphanSectBuildingVisuals(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compat.orphan_sect_building_visuals.apply',
      request,
      targetType: 'compat_conversion',
      targetId: 'building_orphan_sect_visuals',
    }, (actor) => this.orphanSectBuildingVisualsConversion.run({
      mode: 'apply',
      actor,
    }));
  }

  @Post('shortcuts/compat/tongtian-tower-catalog-instance-type/dry-run')
  async dryRunTongtianTowerCatalogInstanceType(@Req() request: unknown) {
    return this.tongtianTowerCatalogInstanceTypeConversion.run({
      mode: 'dry-run',
      actor: extractGmActor(request),
    });
  }

  @Post('shortcuts/compat/tongtian-tower-catalog-instance-type/apply')
  async applyTongtianTowerCatalogInstanceType(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compat.tongtian_tower_catalog_instance_type.apply',
      request,
      targetType: 'compat_conversion',
      targetId: 'tongtian_tower_catalog_instance_type',
    }, (actor) => this.tongtianTowerCatalogInstanceTypeConversion.run({
      mode: 'apply',
      actor,
    }));
  }
  /**
 * cleanupAbnormalTemporaryTiles：清理异常临时石头。
 * @returns 清理结果。
 */


  @Post('shortcuts/world/cleanup-abnormal-temporary-tiles')
  async cleanupAbnormalTemporaryTiles(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.world.cleanup_abnormal_temporary_tiles',
      request,
      targetType: 'world',
      targetId: 'temporary_tiles',
    }, () => this.nextGmWorldService.cleanupAbnormalTemporaryTiles());
  }
  /**
 * compensateAllPlayersCombatExp：补偿全部非机器人的战斗经验。
 * @returns 无返回值，直接更新全部战斗经验补偿相关状态。
 */


  @Post('shortcuts/compensation/combat-exp-2026-04-09')
  async compensateAllPlayersCombatExp(@Body() body: GmPlayerScopeBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compensation.combat_exp_2026_04_09',
      request,
      targetType: 'player',
      targetId: 'scope',
      after: { playerIds: body?.playerIds ?? [], targetPlayerIds: body?.targetPlayerIds ?? [] },
    }, async () => {
      const result = await this.nextGmPlayerService.compensateAllPlayersCombatExp(body ?? {});
      this.nextGmWorldService.invalidatePlayerListCaches();
      return result;
    });
  }
  /**
 * compensateAllPlayersFoundation：补偿全部非机器人的底蕴。
 * @returns 无返回值，直接更新全部底蕴补偿相关状态。
 */


  @Post('shortcuts/compensation/foundation-2026-04-09')
  async compensateAllPlayersFoundation(@Body() body: GmPlayerScopeBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.shortcuts.compensation.foundation_2026_04_09',
      request,
      targetType: 'player',
      targetId: 'scope',
      after: { playerIds: body?.playerIds ?? [], targetPlayerIds: body?.targetPlayerIds ?? [] },
    }, async () => {
      const result = await this.nextGmPlayerService.compensateAllPlayersFoundation(body ?? {});
      this.nextGmWorldService.invalidatePlayerListCaches();
      return result;
    });
  }
  /**
 * resetNetworkPerf：执行resetNetworkPerf相关逻辑。
 * @returns 无返回值，直接更新resetNetworkPerf相关状态。
 */


  @Post('perf/network/reset')
  resetNetworkPerf(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.perf.network.reset',
      request,
      targetType: 'perf',
      targetId: 'network',
    }, () => {
      this.nextGmWorldService.resetNetworkPerf();
      return { ok: true };
    });
  }
  @Post('perf/network/payload-capture')
  setNetworkPayloadCapture(@Body() body: { enabled?: unknown }, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.perf.network.payload_capture.set',
      request,
      targetType: 'perf',
      targetId: 'network_payload_capture',
      after: { enabled: body?.enabled === true },
    }, () => {
      this.nextGmWorldService.setNetworkPayloadCaptureEnabled(body?.enabled === true);
      return { ok: true, enabled: body?.enabled === true };
    });
  }
  /**
 * resetCpuPerf：执行resetCpuPerf相关逻辑。
 * @returns 无返回值，直接更新resetCpuPerf相关状态。
 */


  @Post('perf/cpu/reset')
  resetCpuPerf(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.perf.cpu.reset',
      request,
      targetType: 'perf',
      targetId: 'cpu',
    }, () => {
      this.nextGmWorldService.resetCpuPerf();
      return { ok: true };
    });
  }
  /**
 * writeHeapSnapshot：生成 V8 Heap Snapshot 文件。
 * @returns 返回生成文件路径、大小和耗时。
 */


  @Post('perf/memory/heap-snapshot')
  async writeHeapSnapshot(@Query('deleteAfterSummary') deleteAfterSummary: string | undefined, @Req() request: unknown) {
    const shouldDelete = typeof deleteAfterSummary === 'string'
      && (deleteAfterSummary === '1' || deleteAfterSummary.toLowerCase() === 'true');
    return this.executeAuditedGmWrite({
      op: 'gm.perf.memory.heap_snapshot.write',
      request,
      targetType: 'perf',
      targetId: 'heap_snapshot',
      after: { deleteSnapshotAfterSummary: shouldDelete },
    }, () => this.nextGmWorldService.writeHeapSnapshot({ deleteSnapshotAfterSummary: shouldDelete }));
  }

  @Post('perf/memory/gc')
  triggerManualGc(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.perf.memory.gc.trigger',
      request,
      targetType: 'perf',
      targetId: 'manual_gc',
    }, () => this.nextGmWorldService.triggerManualGc());
  }

  /**
   * getHeapSnapshotSummary：读取最近一次生成的 heap snapshot 摘要 JSON。
   * 摘要为 ~50 KB，包含 top N constructor by count / by self_size，以及与上一次摘要的 diff，
   * 帮助在不下载 GB 级 .heapsnapshot 的前提下定位"哪类对象在涨"。
   */
  @Get('perf/memory/heap-snapshot/summary')
  getHeapSnapshotSummary() {
    const summary = this.nextGmWorldService.getLatestHeapSnapshotSummary();
    if (!summary) {
      return { ok: false, reason: 'no_summary_yet', hint: '先 POST /api/gm/perf/memory/heap-snapshot 生成一次' };
    }
    return { ok: true, ...(summary as Record<string, unknown>) };
  }
  /**
 * resetPathfindingPerf：读取resetPathfindingPerf并返回结果。
 * @returns 无返回值，直接更新resetPathfindingPerf相关状态。
 */


  @Post('perf/pathfinding/reset')
  resetPathfindingPerf(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.perf.pathfinding.reset',
      request,
      targetType: 'perf',
      targetId: 'pathfinding',
    }, () => {
      this.nextGmWorldService.resetPathfindingPerf();
      return { ok: true };
    });
  }
  /**
 * createDirectMail：构建并返回目标对象。
 * @param playerId string 玩家 ID。
 * @param body DirectMailBody 参数说明。
 * @returns 无返回值，直接更新Direct邮件相关状态。
 */


  @Post('players/:playerId/mail')
  async createDirectMail(@Param('playerId') playerId: string, @Body() body: DirectMailBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.mail.direct.create',
      request,
      targetType: 'mail',
      targetId: playerId,
      after: (result) => result,
    }, async () => {
      const mailId = await this.nextGmMailService.createDirectMail(playerId, body ?? {});
      return { ok: true, mailId };
    });
  }
  /**
 * createBroadcastMail：构建并返回目标对象。
 * @param body BroadcastMailBody 参数说明。
 * @returns 无返回值，直接更新Broadcast邮件相关状态。
 */


  @Post('mail/broadcast')
  async createBroadcastMail(@Body() body: BroadcastMailBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.mail.broadcast.create',
      request,
      targetType: 'mail',
      targetId: 'broadcast',
      after: (result) => result,
    }, async () => {
      const result = await this.nextGmMailService.createBroadcastMail(body ?? {});
      return { ok: true, mailId: result.mailId, batchId: result.batchId, recipientCount: result.recipientCount };
    });
  }
  /**
 * getRedeemCodeGroups：读取RedeemCodeGroup。
 * @returns 无返回值，完成RedeemCodeGroup的读取/组装。
 */


  @Get('redeem-code-groups')
  getRedeemCodeGroups() {
    return this.redeemCodeRuntimeService.listGroups();
  }
  /**
 * createRedeemCodeGroup：构建并返回目标对象。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 无返回值，直接更新RedeemCodeGroup相关状态。
 */


  @Post('redeem-code-groups')
  async createRedeemCodeGroup(@Body() body: RedeemCodeGroupBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.redeem_code_groups.create',
      request,
      targetType: 'redeem_code_group',
      targetId: null,
      after: { name: body?.name ?? '', rewardCount: body?.rewards?.length ?? 0, count: Number(body?.count) },
    }, () => this.redeemCodeRuntimeService.createGroup(body?.name ?? '', body?.rewards ?? [], Number(body?.count)));
  }
  /**
 * getRedeemCodeGroup：读取RedeemCodeGroup。
 * @param groupId string group ID。
 * @returns 无返回值，完成RedeemCodeGroup的读取/组装。
 */


  @Get('redeem-code-groups/:groupId')
  async getRedeemCodeGroup(@Param('groupId') groupId: string) {
    return this.redeemCodeRuntimeService.getGroupDetail(groupId);
  }
  /**
 * updateRedeemCodeGroup：处理RedeemCodeGroup并更新相关状态。
 * @param groupId string group ID。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 无返回值，直接更新RedeemCodeGroup相关状态。
 */


  @Put('redeem-code-groups/:groupId')
  async updateRedeemCodeGroup(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.redeem_code_groups.update',
      request,
      targetType: 'redeem_code_group',
      targetId: groupId,
      after: { name: body?.name ?? '', rewardCount: body?.rewards?.length ?? 0 },
    }, () => this.redeemCodeRuntimeService.updateGroup(groupId, body?.name ?? '', body?.rewards ?? []));
  }
  /**
 * deleteRedeemCodeGroup：删除未产生使用记录的兑换码分组。
 * @param groupId string group ID。
 * @returns 无返回值，直接更新RedeemCodeGroup相关状态。
 */


  @Delete('redeem-code-groups/:groupId')
  async deleteRedeemCodeGroup(@Param('groupId') groupId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.redeem_code_groups.delete',
      request,
      targetType: 'redeem_code_group',
      targetId: groupId,
    }, () => this.redeemCodeRuntimeService.deleteGroup(groupId));
  }
  /**
 * appendRedeemCodes：执行appendRedeemCode相关逻辑。
 * @param groupId string group ID。
 * @param body RedeemCodeGroupBody 参数说明。
 * @returns 无返回值，直接更新appendRedeemCode相关状态。
 */


  @Post('redeem-code-groups/:groupId/codes')
  async appendRedeemCodes(@Param('groupId') groupId: string, @Body() body: RedeemCodeGroupBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.redeem_code_groups.codes.append',
      request,
      targetType: 'redeem_code_group',
      targetId: groupId,
      after: { count: Number(body?.count) },
    }, () => this.redeemCodeRuntimeService.appendCodes(groupId, Number(body?.count)));
  }
  /**
 * destroyRedeemCode：执行destroyRedeemCode相关逻辑。
 * @param codeId string code ID。
 * @returns 无返回值，直接更新destroyRedeemCode相关状态。
 */


  @Delete('redeem-codes/:codeId')
  async destroyRedeemCode(@Param('codeId') codeId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.redeem_codes.delete',
      request,
      targetType: 'redeem_code',
      targetId: codeId,
    }, () => this.redeemCodeRuntimeService.destroyCode(codeId));
  }
  /**
 * updateMapTick：处理地图tick并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body MapConfigBody 参数说明。
 * @returns 无返回值，直接更新地图tick相关状态。
 */


  @Put('maps/:mapId/tick')
  async updateMapTick(@Param('mapId') mapId: string, @Body() body: MapConfigBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.maps.tick.update',
      request,
      targetType: 'map',
      targetId: mapId,
      after: body ?? {},
    }, async () => {
      await this.nextGmWorldService.updateMapTick(mapId, body ?? {});
      return { ok: true };
    });
  }

  /** 按 instanceId 更新单个实例的 tickSpeed。 */
  @Put('instances/:instanceId/tick')
  async updateInstanceTick(@Param('instanceId') instanceId: string, @Body() body: MapConfigBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.instances.tick.update',
      request,
      targetType: 'world_instance',
      targetId: instanceId,
      after: body ?? {},
    }, () => this.nextGmWorldService.updateInstanceTick(instanceId, body ?? {}));
  }
  /**
 * updateMapTime：处理地图时间并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body MapConfigBody 参数说明。
 * @returns 无返回值，直接更新地图时间相关状态。
 */


  @Put('maps/:mapId/time')
  async updateMapTime(@Param('mapId') mapId: string, @Body() body: MapConfigBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.maps.time.update',
      request,
      targetType: 'map',
      targetId: mapId,
      after: body ?? {},
    }, async () => {
      await this.nextGmWorldService.updateMapTime(mapId, body ?? {});
      return { ok: true };
    });
  }
  /**
 * reloadTickConfig：读取reloadtick配置并返回结果。
 * @returns 无返回值，直接更新reloadtick配置相关状态。
 */


  @Post('tick-config/reload')
  async reloadTickConfig(@Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.tick_config.reload',
      request,
      targetType: 'tick_config',
      targetId: 'runtime',
    }, () => this.nextGmWorldService.reloadTickConfig());
  }
  /**
 * clearWorldObservation：执行clear世界Observation相关逻辑。
 * @param viewerId string viewer ID。
 * @returns 无返回值，直接更新clear世界Observation相关状态。
 */


  @Delete('world-observers/:viewerId')
  clearWorldObservation(@Param('viewerId') viewerId: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.world_observers.delete',
      request,
      targetType: 'world_observer',
      targetId: viewerId,
    }, () => {
      this.nextGmWorldService.clearWorldObservation(viewerId);
      return { ok: true };
    });
  }

  @Get('runtime-flags')
  async listRuntimeFlags() {
    const flags = await this.runtimeFlagService.listFlags();
    return {
      flags: mergeRuntimeFlags(flags, {
        key: GM_NETWORK_PAYLOAD_CAPTURE_FLAG_KEY,
        value: this.nextGmWorldService.isNetworkPayloadCaptureEnabled(),
      }),
    };
  }

  @Post('maintenance')
  async setMaintenance(@Body() body: SetMaintenanceBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.runtime.maintenance.set',
      request,
      targetType: 'runtime_flag',
      targetId: GM_RUNTIME_MAINTENANCE_FLAG_KEY,
      after: { active: body?.active === true },
    }, async () => {
      if (!this.runtimeFlagService.isEnabled()) {
        throw new BadRequestException('当前未启用 GM 运行时开关持久化，无法切换维护中');
      }
      const active = body?.active === true;
      await this.runtimeFlagService.setFlag(GM_RUNTIME_MAINTENANCE_FLAG_KEY, active);
      return {
        ok: true,
        active,
      };
    });
  }

  @Post('server/restart')
  restartServer(@Body() body: RestartServerBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.server.restart',
      request,
      targetType: 'server',
      targetId: 'process',
      after: (result) => result,
    }, (actor) => {
      assertGmHighRiskOperationAllowed(actor, body, {
        scope: GM_HIGH_RISK_CONFIRMATION_CONTRACT.scopes.runtimeOperation,
        confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_CONTRACT.phrases.serverRestart,
        operationName: '服务端重启',
      });
      if (restartRequestedAt !== null) {
        return {
          ok: true,
          restartRequested: true,
          requestedAt: restartRequestedAt,
          alreadyRequested: true,
        };
      }
      restartRequestedAt = new Date().toISOString();
      const delayMs = 500;
      setTimeout(() => {
        process.kill(process.pid, 'SIGTERM');
      }, delayMs).unref();
      return {
        ok: true,
        restartRequested: true,
        requestedAt: restartRequestedAt,
        delayMs,
      };
    });
  }

  @Post('runtime-flags/:key')
  async setRuntimeFlag(@Param('key') key: string, @Body() body: RuntimeFlagBody, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.runtime_flags.set',
      request,
      targetType: 'runtime_flag',
      targetId: typeof key === 'string' ? key.trim() : null,
      after: { key: typeof key === 'string' ? key.trim() : key, value: body?.value === true },
    }, async () => {
      if (!key || typeof key !== 'string') {
        throw new BadRequestException('key is required');
      }
      const normalizedKey = key.trim();
      const value = body?.value === true;
      await this.runtimeFlagService.setFlag(normalizedKey, value);
      if (normalizedKey === GM_NETWORK_PAYLOAD_CAPTURE_FLAG_KEY) {
        this.nextGmWorldService.setNetworkPayloadCaptureEnabled(value);
      }
      return {
        ok: true,
        key: normalizedKey,
        value,
      };
    });
  }

  @Delete('runtime-flags/:key')
  async deleteRuntimeFlag(@Param('key') key: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.runtime_flags.delete',
      request,
      targetType: 'runtime_flag',
      targetId: typeof key === 'string' ? key.trim() : null,
      after: { key: typeof key === 'string' ? key.trim() : key },
    }, async () => {
      if (!key || typeof key !== 'string') {
        throw new BadRequestException('key is required');
      }
      const normalizedKey = key.trim();
      if (normalizedKey === GM_NETWORK_PAYLOAD_CAPTURE_FLAG_KEY) {
        await this.runtimeFlagService.setFlag(GM_NETWORK_PAYLOAD_CAPTURE_FLAG_KEY, false);
        this.nextGmWorldService.setNetworkPayloadCaptureEnabled(false);
        return { ok: true, key: GM_NETWORK_PAYLOAD_CAPTURE_FLAG_KEY };
      }
      await this.runtimeFlagService.deleteFlag(normalizedKey);
      return {
        ok: true,
        key: normalizedKey,
      };
    });
  }

  // ─── 游戏配置中心 ───

  @Get('game-config')
  async listGameConfig() {
    const descriptors = listGameConfigDescriptors();
    const dbEntries = this.gmConfigService.listEntries();
    const dbMap = new Map(dbEntries.map((e) => [e.key, e]));

    const items = descriptors.map((desc) => {
      const dbEntry = dbMap.get(desc.key);
      const currentValue = process.env[desc.key] ?? desc.defaultValue;
      const pendingValue = dbEntry?.value ?? null;
      const pendingRestart = pendingValue !== null && pendingValue !== currentValue;
      return {
        key: desc.key,
        label: desc.label,
        description: desc.description,
        category: desc.category,
        valueType: desc.valueType,
        currentValue,
        pendingValue,
        defaultValue: desc.defaultValue,
        pendingRestart,
        ...(desc.min !== undefined ? { min: desc.min } : {}),
        ...(desc.max !== undefined ? { max: desc.max } : {}),
      };
    });

    return { items, checkedAt: Date.now() };
  }

  @Post('game-config/:key')
  async setGameConfig(@Param('key') key: string, @Body() body: { value?: string }, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.game_config.set',
      request,
      targetType: 'game_config',
      targetId: typeof key === 'string' ? key.trim() : null,
      after: { key: typeof key === 'string' ? key.trim() : key, value: body?.value ?? null },
    }, async () => {
      if (!key || typeof key !== 'string') {
        throw new BadRequestException('key is required');
      }
      const descriptor = getGameConfigDescriptor(key.trim());
      if (!descriptor) {
        throw new BadRequestException(`Unknown config key: ${key}`);
      }
      const value = typeof body?.value === 'string' ? body.value : String(body?.value ?? '');
      // 基本校验
      if (descriptor.valueType === 'number') {
        const num = Number(value);
        if (Number.isNaN(num)) throw new BadRequestException('value must be a valid number');
        if (descriptor.min !== undefined && num < descriptor.min) throw new BadRequestException(`value must be >= ${descriptor.min}`);
        if (descriptor.max !== undefined && num > descriptor.max) throw new BadRequestException(`value must be <= ${descriptor.max}`);
      }
      if (descriptor.valueType === 'boolean') {
        if (value !== 'true' && value !== 'false') throw new BadRequestException('value must be "true" or "false"');
      }
      await this.gmConfigService.setValue(descriptor.key, value);
      return { ok: true, key: descriptor.key, value, pendingRestart: true };
    });
  }

  @Delete('game-config/:key')
  async deleteGameConfig(@Param('key') key: string, @Req() request: unknown) {
    return this.executeAuditedGmWrite({
      op: 'gm.game_config.delete',
      request,
      targetType: 'game_config',
      targetId: typeof key === 'string' ? key.trim() : null,
    }, async () => {
      if (!key || typeof key !== 'string') {
        throw new BadRequestException('key is required');
      }
      const descriptor = getGameConfigDescriptor(key.trim());
      if (!descriptor) {
        throw new BadRequestException(`Unknown config key: ${key}`);
      }
      await this.gmConfigService.deleteValue(descriptor.key);
      return { ok: true, key: descriptor.key, restoredDefault: descriptor.defaultValue };
    });
  }

  /**
   * GM 控制台「交易记录查询」tab 的列表入口。
   * - playerKeyword：纯数字识别为玩家序号 (player_no)；其它当作 playerId 精确匹配。
   * - itemKeyword：物品名（中文/英文 itemId）模糊匹配，服务端用模板表反查匹配 itemId 集合。
   * - 同时存在多条件时为 AND；解析后无匹配立即返回空，避免退化为全表扫描。
   * 返回按 created_at_ms 倒序的一页 GmMarketTradeItem。
   */
  @Get('market/trades')
  listMarketTrades(@Query() query: any) {
    return this.nextGmMarketTradeService.listTrades({
      page: query?.page,
      pageSize: query?.pageSize,
      playerKeyword: query?.playerKeyword,
      itemKeyword: query?.itemKeyword,
    });
  }

  private async executeAuditedGmWrite<T>(
    input: {
      op: string;
      request: unknown;
      targetType: string;
      targetId?: string | null;
      before?: unknown;
      after?: unknown | ((result: T) => unknown);
    },
    work: (actor: ReturnType<typeof extractGmActor>) => T | Promise<T>,
  ): Promise<T> {
    const actor = extractGmActor(input.request);
    try {
      const result = await work(actor);
      const after = typeof input.after === 'function' ? input.after(result) : input.after ?? { result };
      await this.recordGmWriteAudit({
        ...input,
        actor,
        after,
        success: true,
        errorMessage: null,
      });
      return result;
    } catch (error) {
      await this.recordGmWriteAudit({
        op: input.op,
        actor,
        targetType: input.targetType,
        targetId: input.targetId,
        before: input.before,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async recordGmWriteAudit(input: {
    op: string;
    actor: ReturnType<typeof extractGmActor>;
    targetType: string;
    targetId?: string | null;
    before?: unknown;
    after?: unknown;
    success: boolean;
    errorMessage: string | null;
  }): Promise<void> {
    if (!this.gmAuditLogPersistenceService) return;
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: input.op,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        actor: input.actor,
        before: input.before ?? {},
        after: input.after ?? {},
        success: input.success,
        errorMessage: input.errorMessage,
      });
    } catch {
      // 审计服务内部已保护；这里避免 GM 写操作被审计链路反向阻断。
    }
  }
}

function mergeRuntimeFlags(
  flags: Array<{ key: string; value: boolean }>,
  fixedFlag: { key: string; value: boolean },
): Array<{ key: string; value: boolean }> {
  const byKey = new Map<string, { key: string; value: boolean }>();
  for (const flag of Array.isArray(flags) ? flags : []) {
    const key = typeof flag?.key === 'string' ? flag.key.trim() : '';
    if (key) {
      byKey.set(key, { key, value: flag.value === true });
    }
  }
  byKey.set(fixedFlag.key, fixedFlag);
  return Array.from(byKey.values()).sort((left, right) => left.key.localeCompare(right.key));
}
