/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器统一出口。
 */
export * from './procgen-types';
export * from './procgen-random';
export * from './procgen-catalog';
export * from './procgen-fields';
export * from './procgen-structures';
export * from './procgen-buildings';
export * from './procgen-connect';
export * from './procgen-routes';
export * from './procgen-generator';
export * from './procgen-realm-skeleton';
export * from './procgen-presets';
export * from './procgen-chunk';
export * from './procgen-chunk-structures';
export * from './procgen-infinite-themes';
