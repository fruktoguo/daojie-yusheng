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
    const lines = expectLineCap("world-sync.service.ts", source, 180);
    expectAbsent("world-sync.service.ts", source, /nextAuxStateByPlayerId/, "raw aux cache");
    expectAbsent("world-sync.service.ts", source, /function isSame|function shallowEqual|function isPlainEqual/, "遗留 diff helper");
    expectPresent("world-sync.service.ts", source, /worldSyncEnvelopeService\.createInitialEnvelope/, "主 envelope seam");
    expectPresent("world-sync.service.ts", source, /worldSyncAuxStateService\.emitAuxInitialSync/, "aux-state seam");
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
        },
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
