/**
 * 本文件是服务端冷路径运维工具入口，用于迁移、预检、清理或后台任务手动执行。
 *
 * 维护时要让脚本参数、失败退出码和副作用范围清晰，避免误操作生产数据。
 */
// @ts-nocheck

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..", "..");
/**
 * readSource：读取来源并返回结果。
 * @param relativePath 参数说明。
 * @returns 无返回值，完成来源的读取/组装。
 */


function readSource(relativePath) {
    const absolutePath = path.join(packageRoot, "src", relativePath);
    return {
        absolutePath,
        source: fs.readFileSync(absolutePath, "utf8"),
    };
}
/**
 * lineCount：执行line数量相关逻辑。
 * @param source 来源对象。
 * @returns 无返回值，直接更新line数量相关状态。
 */


function lineCount(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source) {
        return 0;
    }
    const lines = source.split("\n").length;
    return source.endsWith("\n") ? lines - 1 : lines;
}
/**
 * expectLineCap：执行expectLineCap相关逻辑。
 * @param label 参数说明。
 * @param source 来源对象。
 * @param maxLines 参数说明。
 * @returns 无返回值，直接更新expectLineCap相关状态。
 */


function expectLineCap(label, source, maxLines) {
    const lines = lineCount(source);
    assert.ok(lines <= maxLines, `${label} 行数超阈值：${lines} > ${maxLines}`);
    return lines;
}
/**
 * expectAbsent：执行expectAbsent相关逻辑。
 * @param label 参数说明。
 * @param source 来源对象。
 * @param pattern 参数说明。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新expectAbsent相关状态。
 */


function expectAbsent(label, source, pattern, reason) {
    assert.ok(!pattern.test(source), `${label} 检测到禁止残余：${reason}`);
}
/**
 * expectPresent：执行expectPresent相关逻辑。
 * @param label 参数说明。
 * @param source 来源对象。
 * @param pattern 参数说明。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新expectPresent相关状态。
 */


function expectPresent(label, source, pattern, reason) {
    assert.ok(pattern.test(source), `${label} 缺少预期边界：${reason}`);
}

function listTypeScriptFiles(root) {
    const files = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const absolutePath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...listTypeScriptFiles(absolutePath));
        }
        else if (entry.isFile() && entry.name.endsWith('.ts')) {
            files.push(absolutePath);
        }
    }
    return files;
}

function checkSmokeSocketParsers() {
    const toolsRoot = path.join(packageRoot, 'src', 'tools');
    let files = 0;
    let socketCalls = 0;
    for (const absolutePath of listTypeScriptFiles(toolsRoot)) {
        const source = fs.readFileSync(absolutePath, 'utf8');
        if (!source.includes('socket.io-client')) {
            continue;
        }
        const calls = source.match(/\(0,\s*socket_io_client_1\.io\)\s*\(|(?:^|[^\w.])io\s*\(/gm) ?? [];
        if (calls.length <= 0) {
            continue;
        }
        const parsers = source.match(/parser\s*:\s*msgpackParser\b/g) ?? [];
        const relativePath = path.relative(packageRoot, absolutePath);
        assert.equal(
            parsers.length,
            calls.length,
            `${relativePath} 的 Socket.IO 客户端必须逐个显式配置 msgpack parser：calls=${calls.length} parsers=${parsers.length}`,
        );
        files += 1;
        socketCalls += calls.length;
    }
    return { files, socketCalls };
}

function checkSmokeSyncEnvelopeConsumers() {
    const toolsRoot = path.join(packageRoot, 'src', 'tools');
    let files = 0;
    for (const absolutePath of listTypeScriptFiles(toolsRoot)) {
        const source = fs.readFileSync(absolutePath, 'utf8');
        if (!source.includes('socket.io-client')
            || !/\.on\((?:shared_1\.)?S2C\.(?:WorldDelta|SelfDelta|PanelDelta)/.test(source)) {
            continue;
        }
        const relativePath = path.relative(packageRoot, absolutePath);
        assert.ok(
            source.includes('bindSmokeSyncEvents') || source.includes('S2C.SyncEnvelope'),
            `${relativePath} 消费拆分增量时必须同时兼容生产主线 SyncEnvelope`,
        );
        files += 1;
    }
    return { files };
}
/**
 * checkWorldRuntime：判断世界运行态是否满足条件。
 * @returns 无返回值，完成世界运行态的条件判断。
 */


function checkWorldRuntime() {
    const { source } = readSource("runtime/world/world-runtime.service.ts");
    const lines = expectLineCap("world-runtime.service.ts", source, 1200);
    expectAbsent("world-runtime.service.ts", source, /pendingCommands\s*=\s*new Map\(/, "主服务不应自持 pendingCommands");
    expectAbsent("world-runtime.service.ts", source, /playerLocations\s*=\s*new Map\(/, "主服务不应自持 playerLocations");
    expectAbsent("world-runtime.service.ts", source, /instances\s*=\s*new Map\(/, "主服务不应自持 instances registry");
    expectPresent("world-runtime.service.ts", source, /worldRuntimeCommandIntakeFacadeService/, "命令入口 facade seam");
    expectPresent("world-runtime.service.ts", source, /worldRuntimeReadFacadeService/, "读侧 facade seam");
    expectPresent("world-runtime.service.ts", source, /worldRuntimeTickDispatchService/, "tick\/dispatch seam");
    expectPresent("world-runtime.service.ts", source, /worldRuntimeGameplayWriteFacadeService/, "写侧 facade seam");
    expectPresent("world-runtime.service.ts", source, /worldRuntimeStateFacadeService/, "state facade seam");
    expectPresent("world-runtime.service.ts", source, /worldRuntimeWorldAccessService/, "world access seam");
    return lines;
}
/**
 * checkWorldGateway：判断世界Gateway是否满足条件。
 * @returns 无返回值，完成世界Gateway的条件判断。
 */


function checkWorldGateway() {
    const { source } = readSource("network/world.gateway.ts");
    const lines = expectLineCap("world.gateway.ts", source, 1400);
    expectAbsent("world.gateway.ts", source, /\n\s+(handleGmGetState|handleGmSpawnBots|handleGmRemoveBots|handleGmUpdatePlayer|handleGmResetPlayer)\(/, "legacy GM 中转壳");
    expectAbsent("world.gateway.ts", source, /\n\s+(executeRedeemCodes|executeUseItem|executeDropItem|executeEquip|executeUnequip|executeCultivate|executeCreateMarketSellOrder|executeCreateMarketBuyOrder|executeBuyMarketItem|executeSellMarketItem|executeCancelMarketOrder|executeClaimMarketStorage|executeBuyNpcShopItem)\(/, "历史 execute 中转壳");
    expectAbsent("world.gateway.ts", source, /marketSubscriberPlayerIds|marketListingRequestsByPlayerId|marketTradeHistoryRequestsByPlayerId/, "raw market session state");
    expectAbsent("world.gateway.ts", source, /worldRuntimeService\.(enqueue|dispatch|usePortal|navigateQuest|executeAction|connectPlayer|disconnectPlayer|removePlayer)/, "gateway 不应直接执行 runtime 写路径");
    expectPresent("world.gateway.ts", source, /gatewayBootstrapHelper\.handleConnection/, "连接入口委托给 bootstrap helper");
    expectPresent("world.gateway.ts", source, /gatewayGuardHelper\.requirePlayerId/, "统一 guard helper");
    return lines;
}
/**
 * checkWorldSync：判断世界同步是否满足条件。
 * @returns 无返回值，完成世界Sync的条件判断。
 */


function checkWorldSync() {
    const { source } = readSource("network/world-sync.service.ts");
    const { source: playerRuntimeSource } = readSource("runtime/player/player-runtime.service.ts");
    const { source: craftRuntimeSource } = readSource("runtime/craft/craft-panel-runtime.service.ts");
    const { source: projectorHelpersSource } = readSource("network/world-projector.helpers.ts");
    const lines = expectLineCap("world-sync.service.ts", source, 250);
    expectAbsent("world-sync.service.ts", source, /nextAuxStateByPlayerId/, "raw aux cache");
    expectAbsent("world-sync.service.ts", source, /function isSame|function shallowEqual|function isPlainEqual/, "遗留 diff helper");
    expectPresent("world-sync.service.ts", source, /worldSyncEnvelopeService\.createInitialEnvelope/, "主 envelope seam");
    expectPresent("world-sync.service.ts", source, /worldSyncAuxStateService\.emitAuxInitialSync/, "aux-state seam");
    expectAbsent("player-runtime.service.ts", playerRuntimeSource, /queuePlayerStateDelta\(|emitPlayerStateDeltaIfChanged|player\.(?:mp|exp|level)\b/, "玩家高频状态不得经错误别名复制进 EventBus");
    expectPresent("world-projector.helpers.ts", projectorHelpersSource, /if \(previous\.self\.hp !== player\.hp\) \{ delta\.hp = player\.hp; \}/, "HP 必须由 selfRevision SelfDelta 同步");
    expectPresent("world-projector.helpers.ts", projectorHelpersSource, /if \(previous\.self\.qi !== player\.qi\) \{ delta\.qi = player\.qi; \}/, "灵力必须由 selfRevision SelfDelta 同步");
    expectPresent("world-projector.helpers.ts", projectorHelpersSource, /delta\.buff = \{[\s\S]*?removeBuffIds:/, "Buff 必须由 PanelDelta patch 同步");
    expectPresent("player-runtime.service.ts", playerRuntimeSource, /refreshWalletCacheFromInventory\(player,[\s\S]*?if \(changed\) \{[\s\S]*?player\.selfRevision \+= 1;/, "钱包投影变化必须推进 SelfDelta 修订");
    expectPresent("player-runtime.service.ts", playerRuntimeSource, /if \(dirtyDomains\.includes\('inventory'\)\) \{[\s\S]*?this\.refreshWalletCacheFromInventory\(player\);/, "成长系统直接变更背包后必须刷新钱包投影");
    expectPresent("craft-panel-runtime.service.ts", craftRuntimeSource, /if \(options\.inventoryChanged\) \{[\s\S]*?this\.playerRuntimeService\.refreshWalletCacheFromInventory\(player\);/, "技艺系统直接变更背包后必须刷新钱包投影");
    return lines;
}
/**
 * checkWorldProjector：判断世界Projector是否满足条件。
 * @returns 无返回值，完成世界Projector的条件判断。
 */


function checkWorldProjector() {
    const { source } = readSource("network/world-projector.service.ts");
    const lines = expectLineCap("world-projector.service.ts", source, 1500);
    expectAbsent("world-projector.service.ts", source, /worldClientEventService|emit\(|socket|sendEnvelope/, "projector 不应承担 socket 发包");
    expectPresent("world-projector.service.ts", source, /createInitialEnvelope/, "initial envelope projection");
    expectPresent("world-projector.service.ts", source, /createDeltaEnvelope/, "delta envelope projection");
    return lines;
}
/**
 * main：执行main相关逻辑。
 * @returns 无返回值，直接更新main相关状态。
 */


function main() {
    const result = {
        ok: true,
        case: "production-boundaries",
        files: {
            worldRuntime: checkWorldRuntime(),
            worldGateway: checkWorldGateway(),
            worldSync: checkWorldSync(),
            worldProjector: checkWorldProjector(),
            smokeSocketParsers: checkSmokeSocketParsers(),
            smokeSyncEnvelopeConsumers: checkSmokeSyncEnvelopeConsumers(),
        },
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
