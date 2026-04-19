"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..", "..");

function readSource(relativePath) {
    const absolutePath = path.join(packageRoot, "src", relativePath);
    return {
        absolutePath,
        source: fs.readFileSync(absolutePath, "utf8"),
    };
}

function lineCount(source) {
    if (!source) {
        return 0;
    }
    const lines = source.split("\n").length;
    return source.endsWith("\n") ? lines - 1 : lines;
}

function expectLineCap(label, source, maxLines) {
    const lines = lineCount(source);
    assert.ok(lines <= maxLines, `${label} 行数超阈值：${lines} > ${maxLines}`);
    return lines;
}

function expectAbsent(label, source, pattern, reason) {
    assert.ok(!pattern.test(source), `${label} 检测到禁止残余：${reason}`);
}

function expectPresent(label, source, pattern, reason) {
    assert.ok(pattern.test(source), `${label} 缺少预期边界：${reason}`);
}

function checkWorldRuntime() {
    const { source } = readSource("runtime/world/world-runtime.service.js");
    const lines = expectLineCap("world-runtime.service.js", source, 1200);
    expectAbsent("world-runtime.service.js", source, /pendingCommands\s*=\s*new Map\(/, "主服务不应自持 pendingCommands");
    expectAbsent("world-runtime.service.js", source, /playerLocations\s*=\s*new Map\(/, "主服务不应自持 playerLocations");
    expectAbsent("world-runtime.service.js", source, /instances\s*=\s*new Map\(/, "主服务不应自持 instances registry");
    expectPresent("world-runtime.service.js", source, /worldRuntimeCommandIntakeFacadeService/, "命令入口 facade seam");
    expectPresent("world-runtime.service.js", source, /worldRuntimeReadFacadeService/, "读侧 facade seam");
    expectPresent("world-runtime.service.js", source, /worldRuntimeTickDispatchService/, "tick\/dispatch seam");
    expectPresent("world-runtime.service.js", source, /worldRuntimeGameplayWriteFacadeService/, "写侧 facade seam");
    expectPresent("world-runtime.service.js", source, /worldRuntimeStateFacadeService/, "state facade seam");
    expectPresent("world-runtime.service.js", source, /worldRuntimeWorldAccessService/, "world access seam");
    return lines;
}

function checkWorldGateway() {
    const { source } = readSource("network/world.gateway.js");
    const lines = expectLineCap("world.gateway.js", source, 1400);
    expectAbsent("world.gateway.js", source, /\n\s+(handleGmGetState|handleGmSpawnBots|handleGmRemoveBots|handleGmUpdatePlayer|handleGmResetPlayer)\(/, "legacy GM 中转壳");
    expectAbsent("world.gateway.js", source, /\n\s+(executeRedeemCodes|executeUseItem|executeDropItem|executeEquip|executeUnequip|executeCultivate|executeCreateMarketSellOrder|executeCreateMarketBuyOrder|executeBuyMarketItem|executeSellMarketItem|executeCancelMarketOrder|executeClaimMarketStorage|executeBuyNpcShopItem)\(/, "历史 execute 中转壳");
    expectAbsent("world.gateway.js", source, /marketSubscriberPlayerIds|marketListingRequestsByPlayerId|marketTradeHistoryRequestsByPlayerId/, "raw market session state");
    expectAbsent("world.gateway.js", source, /worldRuntimeService\.(enqueue|dispatch|usePortal|navigateQuest|executeAction|connectPlayer|disconnectPlayer|removePlayer)/, "gateway 不应直接执行 runtime 写路径");
    expectPresent("world.gateway.js", source, /gatewayBootstrapHelper\.handleConnection/, "连接入口委托给 bootstrap helper");
    expectPresent("world.gateway.js", source, /gatewayGuardHelper\.requirePlayerId/, "统一 guard helper");
    return lines;
}

function checkWorldSync() {
    const { source } = readSource("network/world-sync.service.js");
    const lines = expectLineCap("world-sync.service.js", source, 180);
    expectAbsent("world-sync.service.js", source, /nextAuxStateByPlayerId/, "raw aux cache");
    expectAbsent("world-sync.service.js", source, /function isSame|function shallowEqual|function isPlainEqual/, "遗留 diff helper");
    expectPresent("world-sync.service.js", source, /worldSyncEnvelopeService\.createInitialEnvelope/, "主 envelope seam");
    expectPresent("world-sync.service.js", source, /worldSyncAuxStateService\.emitNextInitialSync/, "aux-state seam");
    return lines;
}

function checkWorldProjector() {
    const { source } = readSource("network/world-projector.service.js");
    const lines = expectLineCap("world-projector.service.js", source, 1500);
    expectAbsent("world-projector.service.js", source, /worldClientEventService|emit\(|socket|sendNextEnvelope/, "projector 不应承担 socket 发包");
    expectPresent("world-projector.service.js", source, /createInitialEnvelope/, "initial envelope projection");
    expectPresent("world-projector.service.js", source, /createDeltaEnvelope/, "delta envelope projection");
    return lines;
}

function main() {
    const result = {
        ok: true,
        case: "mainline-boundaries",
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
