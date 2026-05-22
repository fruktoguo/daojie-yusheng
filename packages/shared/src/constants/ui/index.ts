/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * UI 显示常量入口。
 */
export * from './labels';
export * from './mail';
export * from './session';
export * from './storage';
export * from './runtime';
