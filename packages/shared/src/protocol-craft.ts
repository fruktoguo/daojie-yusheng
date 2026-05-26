/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 协议域文件：炼制（炼丹/强化）相关 payload 接口。
 * 由 protocol.ts 统一 re-export，外部消费者不需要直接导入本文件。
 */
import type { AlchemyPanelSyncView, EnhancementPanelSyncView, TechniqueActivityTasksView } from './service-sync-types';

/** 炼制面板同步包。 */
export interface S2C_AlchemyPanel extends AlchemyPanelSyncView {}

/** 强化面板同步包。 */
export interface S2C_EnhancementPanel extends EnhancementPanelSyncView {}

/** 统一技艺任务列表同步包。 */
export interface S2C_TechniqueActivityTasks extends TechniqueActivityTasksView {}
