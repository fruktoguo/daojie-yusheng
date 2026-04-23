// @ts-nocheck

/**
 * 用途：执行 GM 世界脏积压命令的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmController } = require('../http/native/native-gm.controller');

function createController() {
  return new NativeGmController(
    {
      getRuntimeSummary() {
        return {
          dirtyBacklog: {
            players: 3,
            playerDomains: 7,
            instances: 2,
          },
        };
      },
    },
    {},
    {},
    {},
    {},
  );
}

function main() {
  const controller = createController();
  const dirtyBacklog = controller.getWorldDirtyBacklog();
  assert.deepEqual(dirtyBacklog, {
    players: 3,
    playerDomains: 7,
    instances: 2,
  });
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-dirty-backlog',
    dirtyBacklog,
  }, null, 2));
}

main();
