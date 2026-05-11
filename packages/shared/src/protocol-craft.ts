/**
 * 协议域文件：炼制（炼丹/强化）相关 payload 接口。
 * 由 protocol.ts 统一 re-export，外部消费者不需要直接导入本文件。
 */
import type { AlchemyPanelSyncView, EnhancementPanelSyncView } from './service-sync-types';

/** 炼制面板同步包。 */
export interface S2C_AlchemyPanel extends AlchemyPanelSyncView {}

/** 强化面板同步包。 */
export interface S2C_EnhancementPanel extends EnhancementPanelSyncView {}
