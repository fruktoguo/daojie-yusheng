"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryLegacyPlayerIdentityRow = queryLegacyPlayerIdentityRow;
exports.queryLegacyPlayerSnapshotRow = queryLegacyPlayerSnapshotRow;
/** queryLegacyPlayerIdentityRow：执行对应的业务逻辑。 */
async function queryLegacyPlayerIdentityRow(pool, userId) {
/** result：定义该变量以承载业务值。 */
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
/** queryLegacyPlayerSnapshotRow：执行对应的业务逻辑。 */
async function queryLegacyPlayerSnapshotRow(pool, playerId) {
/** result：定义该变量以承载业务值。 */
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
