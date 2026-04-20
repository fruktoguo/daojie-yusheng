// @ts-nocheck

/**
 * 用途：用双玩家脚本复现掉落、拾取和地面残留的完整流程。
 */

import { io } from "socket.io-client";
import { NEXT_C2S, NEXT_S2C } from "@mud/shared-next";

/** 调试脚本默认连接的本地服务地址。 */
const base = "http://127.0.0.1:40111";

/** 负责制造掉落的调试角色 ID。 */
const dropperId = "dbg_dropper";

/** 负责拾取掉落的调试角色 ID。 */
const looterId = "dbg_looter";

/** 封装 JSON GET 读取，失败时抛错。 */
async function fetchJson(path: string, opts = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const response = await fetch(base + path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

/** 等待毫秒数。 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 读取玩家运行时状态。 */
const state = (id: string) => fetchJson(`/runtime/players/${id}/state`);

/** 读取地块详情，重点看地面掉落是否按预期生成。 */
const tile = (instanceId: string, x: number, y: number) =>
  fetchJson(`/runtime/instances/${instanceId}/tiles/${x}/${y}`);  
  /**
 * main：执行main相关逻辑。
 * @returns 无返回值，直接更新main相关状态。
 */


async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const d = io(base, { path: "/socket.io", transports: ["websocket"] });
  const l = io(base, { path: "/socket.io", transports: ["websocket"] });
  d.on(NEXT_S2C.Error, (payload) => console.log("dropper error", payload));
  l.on(NEXT_S2C.Error, (payload) => console.log("looter error", payload));
  await Promise.all([
    new Promise((resolve) => d.on("connect", resolve)),
    new Promise((resolve) => l.on("connect", resolve)),
  ]);
  d.emit(NEXT_C2S.Hello, { playerId: dropperId, mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  l.emit(NEXT_C2S.Hello, { playerId: looterId, mapId: "yunlai_town", preferredX: 33, preferredY: 5 });
  await sleep(500);
  console.log("initial dropper", (await state(dropperId)).player.x, (await state(dropperId)).player.y);
  console.log("initial looter", (await state(looterId)).player.x, (await state(looterId)).player.y);
  await fetchJson(`/runtime/players/${dropperId}/grant-item`, {
    method: "POST",
    body: JSON.stringify({ itemId: "rat_tail", count: 2 }),
  });
  await sleep(300);

  const ds = await state(dropperId);
  console.log("after grant inv", ds.player.inventory.items);
  d.emit(NEXT_C2S.DropItem, { slotIndex: 0, count: 2 });
  await sleep(500);

  const ds2 = await state(dropperId);
  console.log("after drop state", ds2.player.x, ds2.player.y, ds2.player.inventory.items);
  console.log("tile after drop", JSON.stringify(await tile(ds2.player.instanceId, ds2.player.x, ds2.player.y), null, 2));
  d.close();
  console.log("delete dropper", await fetchJson(`/runtime/players/${dropperId}`, { method: "DELETE" }));
  await sleep(300);
  console.log("looter before move", (await state(looterId)).player.x, (await state(looterId)).player.y);
  l.emit(NEXT_C2S.MoveTo, { x: ds2.player.x, y: ds2.player.y, allowNearestReachable: false });
  for (let i = 0; i < 12; i += 1) {
    await sleep(400);
    const ls = await state(looterId);
    console.log("looter pos", i, ls.player.x, ls.player.y, ls.player.notices.at(-1));
  }
  console.log("tile final", JSON.stringify(await tile(ds2.player.instanceId, ds2.player.x, ds2.player.y), null, 2));
  l.close();
  await fetchJson(`/runtime/players/${looterId}`, { method: "DELETE" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
