"use strict";
/**
 * Legacy玩家数据仓库
 *
 * 提供从Legacy数据库查询玩家身份和快照数据的函数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryLegacyPlayerIdentityRow = queryLegacyPlayerIdentityRow;
exports.queryLegacyPlayerSnapshotRow = queryLegacyPlayerSnapshotRow;
/**
 * 查询Legacy玩家身份信息
 * @param pool 数据库连接池
 * @param userId 用户ID
 * @returns 玩家身份信息，未找到返回null
 */
async function queryLegacyPlayerIdentityRow(pool, userId) {
    const result = await pool.query(`
        SELECT
          u.id AS "userId",
          u.username AS "username",
          u."displayName" AS "displayName",
          u."pendingRoleName" AS "pendingRoleName",
          p.id AS "playerId",
          p.name AS "playerName"
        FROM users u
        LEFT JOIN players p ON p."userId" = u.id
        WHERE u.id::text = $1
        LIMIT 1
      `, [userId]);
    return result.rows[0] ?? null;
}
/**
 * 查询Legacy玩家快照数据
 * @param pool 数据库连接池
 * @param playerId 玩家ID
 * @returns 玩家快照数据，未找到返回null
 */
async function queryLegacyPlayerSnapshotRow(pool, playerId) {
    const result = await pool.query(`
        SELECT
          id,
          "mapId",
          x,
          y,
          facing,
          hp,
          "maxHp",
          qi,
          "pendingLogbookMessages",
          inventory,
          "temporaryBuffs",
          equipment,
          techniques,
          quests,
          bonuses,
          "bodyTraining",
          foundation,
          "combatExp",
          "boneAgeBaseYears",
          "lifeElapsedTicks",
          "lifespanYears",
          "heavenGate",
          "spiritualRoots",
          "unlockedMinimapIds",
          "autoBattle",
          "autoBattleSkills",
          "combatTargetId",
          "combatTargetLocked",
          "autoRetaliate",
          "autoBattleStationary",
          "allowAoePlayerHit",
          "autoIdleCultivation",
          "autoSwitchCultivation",
          "cultivatingTechId"
        FROM players
        WHERE id = $1
        LIMIT 1
      `, [playerId]);
    return result.rows[0] ?? null;
}
