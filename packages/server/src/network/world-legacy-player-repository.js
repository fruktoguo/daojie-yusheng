"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryLegacyPlayerIdentityRow = queryLegacyPlayerIdentityRow;
exports.queryLegacyPlayerSnapshotRow = queryLegacyPlayerSnapshotRow;
// 仅供显式 migration 入口使用的 legacy 数据库查询仓库，不参与 next 主链真源读取。
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

