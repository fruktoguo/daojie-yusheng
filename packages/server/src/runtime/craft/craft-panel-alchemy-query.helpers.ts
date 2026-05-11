/**
 * 炼丹面板查询工具函数。
 * 提供炼丹目录条目、预设和 job 的克隆工具，
 * 以及丹炉标签判定和技能经验解析的公共逻辑。
 */

/** 炼丹目录版本，变化后需要把新目录同步给客户端。 */
const ALCHEMY_CATALOG_VERSION = 1;

/** 丹炉能力判定使用的物品标签。 */
const ALCHEMY_FURNACE_TAG = 'alchemy_furnace';
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
