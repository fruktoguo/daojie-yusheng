/**
 * Actor 子模块统一汇出入口。
 *
 * 包含 ActorBlueprint 类型契约、EphemeralActorIdentity 工具与 Bot HTTP 协议 DTO。
 * 由 packages/shared/src/index.ts 通过 `export * from './actor';` 暴露给前后端。
 */

export * from './actor-blueprint';
export * from './ephemeral-actor-identity';
export * from './bot-protocol';
