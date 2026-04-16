/**
 * shared 常量分组入口。
 *
 * 说明：
 * - 该目录用于承载可按业务认知分类的常量集合。
 * - `legacy/shared/src/constants.ts` 仍保留为兼容层，避免一次性破坏旧引用。
 */
// TODO(next:T24): 在 legacy/shared 常量入口彻底退役后，删除旧桥接口径并把剩余引用完全收口到分组常量导出。
export * from './gameplay';
export * from './network';
export * from './ui';
export * from './visuals';
