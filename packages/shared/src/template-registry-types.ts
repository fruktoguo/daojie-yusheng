/**
 * 本文件负责前后端共享的类型、常量或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时要保持跨端无副作用和依赖一致，避免引入只适用于浏览器或只适用于服务端的私有状态。
 */
export type InstanceInit<TInstance> = Partial<TInstance>;

export type PersistedInstance<TInstance> = Partial<TInstance>;

export interface TemplateRegistry<TId extends string, TTemplate, TInstance> {
  /** 启动期一次性加载并冻结模板表。 */
  loadAll(): void;
  /** 内部权威读取入口；找不到模板必须抛出含 id 的错误。 */
  getRef(id: TId): Readonly<TTemplate>;
  /** 可降级读取入口；调用方必须显式处理 undefined。 */
  tryGetRef(id: TId): Readonly<TTemplate> | undefined;
  /** 唯一实例化入口；实现侧必须限制运行态 own 字段。 */
  createInstance(id: TId, init: InstanceInit<TInstance>): TInstance;
  /** 从持久化 payload 恢复实例；实现侧必须只恢复运行态字段。 */
  hydrate(id: TId, payload: PersistedInstance<TInstance>): TInstance;
  /** 调试与冷路径枚举入口；禁止在 tick 热路径使用。 */
  listIds(): readonly TId[];
}
