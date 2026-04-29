/**
 * shared 常量分组入口。
 *
 * 说明：
 * - 该目录承载可按业务认知分类的常量集合。
 * - `packages/shared/src/constants.ts` 旧根桥文件已退役，shared 内部与对外导出统一走分组入口。
 */
export * from './gameplay';
export * from './network';
export * from './ui';
export * from './visuals';
