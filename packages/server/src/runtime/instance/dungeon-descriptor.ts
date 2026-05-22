/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 秘境框架预留接口。
 * 定义秘境描述符和模板工厂，为后续随机地形秘境预留扩展点。
 */

/** 秘境描述符：描述秘境类型和参数，持久化到 checkpoint。 */
export interface DungeonDescriptor {
  /** 秘境类型标识。 */
  type: string;
  /** 类型特定参数。 */
  params: unknown;
}

/** 通天塔秘境参数。 */
export interface TowerDungeonParams {
  layer: number;
}

/** 后续随机洞穴参数（预留）。 */
export interface RandomCaveDungeonParams {
  seed: number;
  difficulty: number;
  biome: string;
}

/** 后续试炼场参数（预留）。 */
export interface TrialDungeonParams {
  trialId: string;
  stage: number;
}

/** 秘境模板工厂接口：根据 descriptor 生成或恢复模板。 */
export interface DungeonTemplateFactory {
  /** 支持的秘境类型。 */
  readonly dungeonType: string;
  /** 根据 descriptor 注册模板并返回 templateId。 */
  ensureTemplate(descriptor: DungeonDescriptor): string;
}

/** 通天塔模板工厂实现。 */
export class TowerTemplateFactory implements DungeonTemplateFactory {
  readonly dungeonType = 'tower';

  constructor(
    private readonly towerService: {
      ensureLayerTemplate?(layer: number): string;
    },
  ) {}

  ensureTemplate(descriptor: DungeonDescriptor): string {
    const params = descriptor.params as TowerDungeonParams;
    const layer = Math.max(1, Math.trunc(Number(params?.layer) || 1));
    if (typeof this.towerService.ensureLayerTemplate === 'function') {
      return (this.towerService as any).ensureLayerTemplate(layer);
    }
    return `tongtian_tower_layer_${layer}`;
  }
}
