/**
 * 用途：用双玩家脚本复现并调试掉落与拾取流程。
 */

const { io } = require('socket.io-client');
const { NEXT_C2S, NEXT_S2C } = require('/home/yuohira/mud-mmo/packages/shared/dist');
const base = 'http://127.0.0.1:40111';
/** dropperId：定义该变量以承载业务值。 */
const dropperId='dbg_dropper';
/**
 * 记录looterID。
 */
const looterId='dbg_looter';
/**
 * 处理fetchjson。
 */
async function fetchJson(path, opts = {}) {
/**
 * 记录response。
 */
  const response = await fetch(base + path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}
/**
 * 记录sleep。
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * 记录状态。
 */
const state = (id) => fetchJson(`/runtime/players/${id}/state`);
/**
 * 记录tile。
 */
const tile = (instanceId, x, y) => fetchJson(`/runtime/instances/${instanceId}/tiles/${x}/${y}`);
/**
 * 串联执行脚本主流程。
 */
async function main() {
/**
 * 记录d。
 */
  const d = io(base, { path: '/socket.io', transports: ['websocket'] });
/**
 * 记录l。
 */
  const l = io(base, { path: '/socket.io', transports: ['websocket'] });
  d.on(NEXT_S2C.Error, (payload) => console.log('dropper error', payload));
  l.on(NEXT_S2C.Error, (payload) => console.log('looter error', payload));
  await Promise.all([
    new Promise((resolve) => d.on('connect', resolve)),
    new Promise((resolve) => l.on('connect', resolve)),
  ]);
  d.emit(NEXT_C2S.Hello, { playerId: dropperId, mapId: 'yunlai_town', preferredX: 32, preferredY: 5 });
  l.emit(NEXT_C2S.Hello, { playerId: looterId, mapId: 'yunlai_town', preferredX: 33, preferredY: 5 });
  await sleep(500);
  console.log('initial dropper', (await state(dropperId)).player.x, (await state(dropperId)).player.y);
  console.log('initial looter', (await state(looterId)).player.x, (await state(looterId)).player.y);
  await fetchJson(`/runtime/players/${dropperId}/grant-item`, { method: 'POST', body: JSON.stringify({ itemId: 'rat_tail', count: 2 }) });
  await sleep(300);
/**
 * 记录ds。
 */
  const ds = await state(dropperId);
  console.log('after grant inv', ds.player.inventory.items);
  d.emit(NEXT_C2S.DropItem, { slotIndex: 0, count: 2 });
  await sleep(500);
/**
 * 记录ds2。
 */
  const ds2 = await state(dropperId);
  console.log('after drop state', ds2.player.x, ds2.player.y, ds2.player.inventory.items);
  console.log('tile after drop', JSON.stringify(await tile(ds2.player.instanceId, ds2.player.x, ds2.player.y), null, 2));
  d.close();
  console.log('delete dropper', await fetchJson(`/runtime/players/${dropperId}`, { method: 'DELETE' }));
  await sleep(300);
  console.log('looter before move', (await state(looterId)).player.x, (await state(looterId)).player.y);
  l.emit(NEXT_C2S.MoveTo, { x: ds2.player.x, y: ds2.player.y, allowNearestReachable: false });
  for (let i = 0; i < 12; i += 1) {
    await sleep(400);
/**
 * 记录ls。
 */
    const ls = await state(looterId);
    console.log('looter pos', i, ls.player.x, ls.player.y, ls.player.notices.at(-1));
  }
  console.log('tile final', JSON.stringify(await tile(ds2.player.instanceId, ds2.player.x, ds2.player.y), null, 2));
  l.close();
  await fetchJson(`/runtime/players/${looterId}`, { method: 'DELETE' });
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
