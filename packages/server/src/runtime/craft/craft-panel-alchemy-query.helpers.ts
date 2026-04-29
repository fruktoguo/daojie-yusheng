// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ALCHEMY_FURNACE_TAG = exports.ALCHEMY_CATALOG_VERSION = void 0;
exports.cloneAlchemyCatalogEntry = cloneAlchemyCatalogEntry;
exports.cloneAlchemyPreset = cloneAlchemyPreset;
exports.cloneAlchemyJob = cloneAlchemyJob;

/** 炼丹目录版本，变化后需要把新目录同步给客户端。 */
const ALCHEMY_CATALOG_VERSION = 1;
exports.ALCHEMY_CATALOG_VERSION = ALCHEMY_CATALOG_VERSION;

/** 丹炉能力判定使用的物品标签。 */
const ALCHEMY_FURNACE_TAG = 'alchemy_furnace';
exports.ALCHEMY_FURNACE_TAG = ALCHEMY_FURNACE_TAG;
/**
 * cloneAlchemyCatalogEntry：构建炼丹目录条目。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新炼丹目录条目相关状态。
 */


function cloneAlchemyCatalogEntry(entry) {
    return {
        ...entry,
        ingredients: entry.ingredients.map((ingredient) => ({ ...ingredient })),
    };
}
/**
 * cloneAlchemyPreset：构建炼丹Preset。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */


function cloneAlchemyPreset(entry) {
    return {
        ...entry,
        ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
    };
}
/**
 * cloneAlchemyJob：构建炼丹Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新炼丹Job相关状态。
 */


function cloneAlchemyJob(entry) {
    return {
        ...entry,
        ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
    };
}
export {
    ALCHEMY_CATALOG_VERSION,
    ALCHEMY_FURNACE_TAG,
    cloneAlchemyCatalogEntry,
    cloneAlchemyPreset,
    cloneAlchemyJob,
};
