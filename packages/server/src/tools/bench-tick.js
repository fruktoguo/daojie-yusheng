"use strict";
/**
 * 用途：基准测试 tick 链路性能。
 */

Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@mud/shared-next");
const map_instance_runtime_1 = require("../runtime/instance/map-instance.runtime");
/**
 * 记录width。
 */
const WIDTH = 128;
/**
 * 记录height。
 */
const HEIGHT = 128;
/**
 * 记录warmupticks。
 */
const WARMUP_TICKS = 20;
/**
 * 记录sampleticks。
 */
const SAMPLE_TICKS = 240;
/**
 * 记录scenarios。
 */
const SCENARIOS = [100, 500, 1000];
/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 记录template。
 */
    const template = createOpenTemplate(WIDTH, HEIGHT);
/**
 * 记录scenarios。
 */
    const scenarios = SCENARIOS.map((playerCount) => runScenario(template, playerCount));
    console.log(JSON.stringify({
        ok: true,
        width: WIDTH,
        height: HEIGHT,
        warmupTicks: WARMUP_TICKS,
        sampleTicks: SAMPLE_TICKS,
        scenarios,
    }, null, 2));
}
/**
 * 运行scenario。
 */
function runScenario(template, playerCount) {
/**
 * 记录instance。
 */
    const instance = new map_instance_runtime_1.MapInstanceRuntime({
        instanceId: `bench:${playerCount}`,
        template,
        monsterSpawns: [],
        kind: 'public',
        persistent: false,
        createdAt: Date.now(),
    });
/**
 * 记录positions。
 */
    const positions = buildSpawnPositions(playerCount, template.width, template.height);
    if (positions.length < playerCount) {
        throw new Error(`not enough spawn positions for ${playerCount} players`);
    }
    for (let index = 0; index < playerCount; index += 1) {
/**
 * 记录出生点。
 */
        const spawn = positions[index];
        instance.connectPlayer({
            playerId: `player_${index}`,
            sessionId: `session_${index}`,
            preferredX: spawn.x,
            preferredY: spawn.y,
        });
    }
    for (let tick = 0; tick < WARMUP_TICKS; tick += 1) {
        enqueueWave(instance, playerCount, tick);
        instance.tickOnce();
    }
/**
 * 记录durationsms。
 */
    const durationsMs = [];
    for (let tick = 0; tick < SAMPLE_TICKS; tick += 1) {
        enqueueWave(instance, playerCount, tick);
/**
 * 记录startedat。
 */
        const startedAt = performance.now();
        instance.tickOnce();
        durationsMs.push(performance.now() - startedAt);
    }
    return {
        playerCount,
        avgMs: round3(average(durationsMs)),
        p95Ms: round3(percentile(durationsMs, 0.95)),
        p99Ms: round3(percentile(durationsMs, 0.99)),
        maxMs: round3(Math.max(...durationsMs)),
    };
}
/**
 * 处理enqueuewave。
 */
function enqueueWave(instance, playerCount, tick) {
/**
 * 记录direction。
 */
    const direction = tick % 2 === 0 ? shared_1.Direction.East : shared_1.Direction.West;
    for (let index = 0; index < playerCount; index += 1) {
        instance.enqueueMove({
            playerId: `player_${index}`,
            direction,
        });
    }
}
/**
 * 构建出生点positions。
 */
function buildSpawnPositions(playerCount, width, height) {
/**
 * 记录positions。
 */
    const positions = [];
    for (let y = 2; y < height - 2 && positions.length < playerCount; y += 2) {
        for (let x = 2; x < width - 2 && positions.length < playerCount; x += 2) {
            positions.push({ x, y });
        }
    }
    return positions;
}
/**
 * 创建opentemplate。
 */
function createOpenTemplate(width, height) {
/**
 * 记录地形row。
 */
    const terrainRow = '.'.repeat(width);
    return {
        id: 'bench_open',
        name: 'Bench Open',
        width,
        height,
        routeDomain: 'system',
        terrainRows: Array.from({ length: height }, () => terrainRow),
        spawnX: 2,
        spawnY: 2,
        safeZones: [],
        landmarks: [],
        containers: [],
        npcs: [],
        portals: [],
        portalIndexByTile: new Int32Array(width * height).fill(-1),
        safeZoneMask: new Uint8Array(width * height),
        walkableMask: new Uint8Array(width * height).fill(1),
        blocksSightMask: new Uint8Array(width * height),
        baseAuraByTile: new Int32Array(width * height),
        source: {},
    };
}
/**
 * 处理average。
 */
function average(values) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
/**
 * 处理percentile。
 */
function percentile(values, ratio) {
    if (values.length === 0) {
        return 0;
    }
/**
 * 记录sorted。
 */
    const sorted = [...values].sort((left, right) => left - right);
/**
 * 记录索引。
 */
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
    return sorted[index];
}
/**
 * 处理round3。
 */
function round3(value) {
    return Number(value.toFixed(3));
}
main();
//# sourceMappingURL=bench-tick.js.map