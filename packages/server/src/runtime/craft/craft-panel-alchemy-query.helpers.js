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

function cloneAlchemyCatalogEntry(entry) {
    return {
        ...entry,
        ingredients: entry.ingredients.map((ingredient) => ({ ...ingredient })),
    };
}

function cloneAlchemyPreset(entry) {
    return {
        ...entry,
        ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
    };
}

function cloneAlchemyJob(entry) {
    return {
        ...entry,
        ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
    };
}
