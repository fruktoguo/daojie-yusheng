// @ts-nocheck

/**
 * 用途：批量清理 server 本地数据库中的 smoke / audit 临时玩家残留。
 */

Object.defineProperty(exports, "__esModule", { value: true });

const smoke_player_cleanup_1 = require("./smoke-player-cleanup");

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const summary = await (0, smoke_player_cleanup_1.purgeSmokeTestArtifacts)({
    dryRun,
  });
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
