import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';

import {
  GmMapConfigPersistenceService,
  type GmMapConfigRecord,
} from '../../persistence/gm-map-config-persistence.service';
import { MapTemplateRepository } from './map-template.repository';

type MapTemplateRepositoryLike = {
  listSummaries(): Array<{ id: string }>;
  getOrThrow(mapId: string): { source?: { time?: Record<string, unknown> } };
};

/** 地图运行配置缓存：记录每张地图的 tick 倍速、暂停状态和时间参数。 */
@Injectable()
export class RuntimeMapConfigService implements OnModuleInit {
  private readonly logger = new Logger(RuntimeMapConfigService.name);
  /** 按地图缓存 GM 下发的 tick 速度。 */
  private readonly gmMapTickSpeedByMapId = new Map<string, number>();
  /** 按地图缓存是否暂停推进。 */
  private readonly gmMapPausedByMapId = new Map<string, boolean>();
  /** 按地图缓存时间缩放与偏移。 */
  private readonly gmMapTimeConfigByMapId = new Map<string, Record<string, unknown>>();

  constructor(
    @Optional()
    @Inject(MapTemplateRepository)
    private readonly mapTemplateRepository: MapTemplateRepositoryLike | null = null,
    @Optional()
    @Inject(GmMapConfigPersistenceService)
    private readonly gmMapConfigPersistenceService: GmMapConfigPersistenceService | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.restorePersistedMapConfigs();
  }

  /** 从数据库恢复 GM 地图 tick/time 覆盖配置。 */
  async restorePersistedMapConfigs(): Promise<number> {
    if (!this.mapTemplateRepository || !this.gmMapConfigPersistenceService) {
      return 0;
    }

    const validMapIds = new Set<string>(
      this.mapTemplateRepository.listSummaries()
        .map((entry) => entry.id)
        .filter((mapId): mapId is string => typeof mapId === 'string' && mapId.length > 0),
    );
    await this.gmMapConfigPersistenceService.pruneMapConfigs(validMapIds);
    const records = await this.gmMapConfigPersistenceService.loadAllMapConfigs();
    let restoredCount = 0;
    for (const record of records) {
      if (!record.mapId || !validMapIds.has(record.mapId)) {
        continue;
      }
      if (this.applyPersistedMapConfig(record)) {
        restoredCount += 1;
      }
    }
    this.logger.log(`已从数据库恢复 ${restoredCount} 张地图的 GM 配置`);
    return restoredCount;
  }

  private applyPersistedMapConfig(record: GmMapConfigRecord): boolean {
    try {
      const template = this.mapTemplateRepository?.getOrThrow(record.mapId);
      if (!template) {
        return false;
      }
      this.updateMapTick(record.mapId, {
        speed: record.speed,
        paused: record.paused,
      });
      this.updateMapTime(record.mapId, template.source?.time ?? {}, {
        scale: record.scale,
        offsetTicks: record.offsetTicks,
      });
      return true;
    } catch (error: unknown) {
      this.logger.warn(
        `加载 GM 地图配置失败 mapId=${record.mapId}，已跳过`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  /** 更新地图的 tick 速度与暂停状态。 */
  updateMapTick(mapId: string, body?: { speed?: unknown; paused?: unknown } | null): void {
    if (body?.paused === true || body?.speed === 0) {
      this.gmMapPausedByMapId.set(mapId, true);
      this.gmMapTickSpeedByMapId.set(mapId, 0);
      return;
    }
    if (body?.paused === false) {
      this.gmMapPausedByMapId.set(mapId, false);
    }
    if (Number.isFinite(Number(body?.speed))) {
      const speed = clamp(Number(body?.speed), 0, 100);
      this.gmMapTickSpeedByMapId.set(mapId, speed);
      this.gmMapPausedByMapId.set(mapId, speed === 0);
    }
  }

  /** 更新地图时间参数，供 GM 调整昼夜节奏。 */
  updateMapTime(
    mapId: string,
    baseTimeConfig: Record<string, unknown> | null | undefined,
    body?: { scale?: unknown; offsetTicks?: unknown } | null,
  ): void {
    const current = this.getMapTimeConfig(mapId, baseTimeConfig ?? {});
    const next = {
      ...current,
    };
    if (Number.isFinite(Number(body?.scale))) {
      next.scale = Math.max(0, Number(body?.scale));
    }
    if (Number.isFinite(Number(body?.offsetTicks))) {
      next.offsetTicks = Math.trunc(Number(body?.offsetTicks));
    }
    this.gmMapTimeConfigByMapId.set(mapId, {
      ...(baseTimeConfig ?? {}),
      ...next,
    });
  }

  /** 清理已经不存在的地图配置，避免脏数据继续占用内存。 */
  pruneMapConfigs(validMapIds: Set<string>): void {
    for (const mapId of Array.from(this.gmMapTickSpeedByMapId.keys())) {
      if (!validMapIds.has(mapId)) {
        this.gmMapTickSpeedByMapId.delete(mapId);
        this.gmMapPausedByMapId.delete(mapId);
        this.gmMapTimeConfigByMapId.delete(mapId);
      }
    }
  }

  /** 读取地图当前 tick 速度，默认按正常速度推进。 */
  getMapTickSpeed(mapId: string): number {
    if (this.gmMapPausedByMapId.get(mapId) === true) {
      return 0;
    }

    const speed = this.gmMapTickSpeedByMapId.get(mapId);
    return Number.isFinite(speed) ? speed : 1;
  }

  /** 判断地图是否处于暂停状态。 */
  isMapPaused(mapId: string): boolean {
    return this.gmMapPausedByMapId.get(mapId) === true || this.getMapTickSpeed(mapId) === 0;
  }

  /** 合并地图基础时间配置与 GM 覆盖配置。 */
  getMapTimeConfig(mapId: string, baseTimeConfig: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...(baseTimeConfig ?? {}),
      ...(this.gmMapTimeConfigByMapId.get(mapId) ?? {}),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
