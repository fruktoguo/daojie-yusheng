/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * Actor 子模块统一汇出入口。
 *
 * 包含 ActorBlueprint 类型契约、EphemeralActorIdentity 工具与 Bot HTTP 协议 DTO。
 * 由 packages/shared/src/index.ts 通过 `export * from './actor';` 暴露给前后端。
 */

export * from './actor-blueprint';
export * from './ephemeral-actor-identity';
export * from './bot-protocol';
