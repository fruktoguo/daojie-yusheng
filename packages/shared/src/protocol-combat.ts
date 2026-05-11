/**
 * 协议域文件：战斗相关 payload 接口。
 * 由 protocol.ts 统一 re-export，外部消费者不需要直接导入本文件。
 *
 * 注：S2C_Tick、S2C_ActionsUpdate 等战斗域 payload 因 TypeScript export shadowing
 * 约束保留在 protocol.ts 本体。本文件作为域标记存在，便于后续扩展战斗专属协议接口。
 */
export {};
