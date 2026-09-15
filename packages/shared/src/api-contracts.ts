/**
 * 本文件负责前后端共享的类型、常量或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时要保持跨端无副作用和依赖一致，避免引入只适用于浏览器或只适用于服务端的私有状态。
 *
 * 本文件已按领域拆分为 ./api-contracts/ 下的多个子模块，此处仅做 barrel 聚合再导出。
 */

export * from './api-contracts/auth-account';
export * from './api-contracts/gm-market-technique';
export * from './api-contracts/gm-player-management';
export * from './api-contracts/gm-redeem-code';
export * from './api-contracts/gm-log-worker-diagnostics';
export * from './api-contracts/gm-database-backup';
export * from './api-contracts/gm-editor-catalog';
export * from './api-contracts/gm-map-document';
export * from './api-contracts/gm-world-runtime';
