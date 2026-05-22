/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 旧地图整档快照持久化服务（已废弃）。
 * 地图真源已迁移至 instance_* 分域表（InstanceDomainPersistenceService）。
 * 仅保留类定义供 tools 中 isEnabled() 检查使用，运行时不再读写。
 */
import { Injectable, Logger } from '@nestjs/common';

/** 旧地图整档快照服务：硬切后仅保留 isEnabled() 供退役审计工具使用。 */
@Injectable()
export class MapPersistenceService {
  private readonly logger = new Logger(MapPersistenceService.name);

  async onModuleInit() {
    this.logger.log('旧地图整档快照服务已禁用：地图真源必须使用 instance_* 分域表');
  }

  /** 永远返回 false：旧快照链路已完全禁用。 */
  isEnabled(): boolean {
    return false;
  }
}
