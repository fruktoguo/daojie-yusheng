/**
 * 统一地块恢复接口。
 * 不同类型地图（模板地图、宗门、秘境）通过实现此接口提供地块恢复策略。
 */

/** 地块恢复配置。 */
export interface TileRecoveryConfig {
  /** 是否启用自动恢复。 */
  enabled: boolean;
  /** 恢复间隔（tick 数）。 */
  intervalTicks: number;
}

/** 地块恢复提供者接口。 */
export interface TileRecoveryProvider {
  /** 获取指定坐标的原始地块类型（用于自动恢复目标）。 */
  getOriginalTileType(instanceId: string, x: number, y: number): number | null;
  /** 获取实例的恢复配置。 */
  getRecoveryConfig(instanceId: string): TileRecoveryConfig;
}

/** 模板地图地块恢复提供者：从 template.legacyTileRows / terrainRows 读取原始地块。 */
export class TemplateTileRecoveryProvider implements TileRecoveryProvider {
  getOriginalTileType(instanceId: string, x: number, y: number): number | null {
    // 模板地图的原始地块类型由 MapInstanceRuntime.getBaseTileType 提供，
    // 该方法已经从 template 中读取。此 provider 作为显式接口声明。
    void instanceId;
    void x;
    void y;
    return null; // 由实例自身的 getBaseTileType 处理
  }

  getRecoveryConfig(_instanceId: string): TileRecoveryConfig {
    return { enabled: true, intervalTicks: 1 };
  }
}

/** 宗门地块恢复提供者：从宗门等级和扩展状态计算当前应有布局。 */
export class SectTileRecoveryProvider implements TileRecoveryProvider {
  getOriginalTileType(instanceId: string, x: number, y: number): number | null {
    // 宗门地块恢复由 worldRuntimeSectService 的逻辑管理，
    // 核心区域为空地，外围为石头。
    void instanceId;
    void x;
    void y;
    return null; // 由宗门服务的 isSectInnateStabilized 处理
  }

  getRecoveryConfig(_instanceId: string): TileRecoveryConfig {
    return { enabled: true, intervalTicks: 1 };
  }
}

/** 秘境地块恢复提供者：默认不自动恢复（由波次逻辑管理）。 */
export class DungeonTileRecoveryProvider implements TileRecoveryProvider {
  getOriginalTileType(_instanceId: string, _x: number, _y: number): number | null {
    return null;
  }

  getRecoveryConfig(_instanceId: string): TileRecoveryConfig {
    return { enabled: false, intervalTicks: 0 };
  }
}
