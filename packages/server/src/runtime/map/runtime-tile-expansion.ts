// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.expandRuntimeTiles = exports.createSquareExpansionShape = void 0;

/** createSquareExpansionShape：创建以 origin 为中心的方形候选坐标策略。 */
function createSquareExpansionShape(radius) {
    const normalizedRadius = Math.max(0, Math.trunc(Number(radius) || 0));
    return {
        collect(originX, originY, visitor) {
            const x0 = Math.trunc(Number(originX) || 0);
            const y0 = Math.trunc(Number(originY) || 0);
            for (let y = y0 - normalizedRadius; y <= y0 + normalizedRadius; y += 1) {
                for (let x = x0 - normalizedRadius; x <= x0 + normalizedRadius; x += 1) {
                    visitor(x, y);
                }
            }
        },
    };
}
exports.createSquareExpansionShape = createSquareExpansionShape;

/** expandRuntimeTiles：按候选形状和生成器激活不存在的运行时地块。 */
function expandRuntimeTiles(instance, originX, originY, shape, generator, context = null) {
    if (!instance || typeof instance.activateRuntimeTile !== 'function' || !shape || typeof shape.collect !== 'function' || !generator || typeof generator.generate !== 'function') {
        return {
            attempted: 0,
            created: 0,
            skippedExisting: 0,
            rejected: 0,
        };
    }
    let attempted = 0;
    let created = 0;
    let skippedExisting = 0;
    let rejected = 0;
    const seed = { tileType: null, aura: undefined };
    shape.collect(originX, originY, (x, y) => {
        attempted += 1;
        if (instance.isInBounds?.(x, y) === true) {
            skippedExisting += 1;
            return;
        }
        seed.tileType = null;
        seed.aura = undefined;
        generator.generate(x, y, context, seed);
        if (typeof seed.tileType !== 'string' || seed.tileType.length <= 0) {
            rejected += 1;
            return;
        }
        const result = instance.activateRuntimeTile(x, y, seed.tileType, Number.isFinite(Number(seed.aura)) ? { aura: seed.aura } : {});
        if (result?.created === true) {
            created += 1;
        }
        else {
            skippedExisting += 1;
        }
    });
    return {
        attempted,
        created,
        skippedExisting,
        rejected,
    };
}
exports.expandRuntimeTiles = expandRuntimeTiles;
export { createSquareExpansionShape, expandRuntimeTiles };
