/**
 * 掉落系统相关的常量，方便 LootService 与其他逻辑共享配置值。
 */
import type { TechniqueGrade } from '@mud/shared';

/** 不同功法等级搜索容器所需的 tick 数 */
export const CONTAINER_SEARCH_TICKS: Record<TechniqueGrade, number> = {
  mortal: 1,
  yellow: 1,
  mystic: 2,
  earth: 2,
  heaven: 3,
  spirit: 3,
  saint: 4,
  emperor: 4,
};
