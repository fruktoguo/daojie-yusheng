/**
 * 本文件定义客户端百科境界等级表展示数据，复用本地内容 catalog 与共享境界区间。
 *
 * 维护时要把这里视为展示层投影，不在客户端重新裁定境界升级规则。
 */
import { gameplayConstants } from '@mud/shared';
import { LOCAL_EDITOR_CATALOG } from '../../content/editor-catalog';

export interface TutorialRealmLevelTableRow {
  realmLv: number;
  displayName: string;
  majorRealmName: string;
  repeatedMajorRealm: boolean;
  expToNext: number;
}

function toFiniteInteger(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
}

const REALM_STAGE_ROWS = gameplayConstants.getRealmTable();

function resolveMajorRealmName(realmLv: number): { key: string; name: string } {
  const stageRow = REALM_STAGE_ROWS.find((row) => realmLv >= row.levelFrom && realmLv <= row.levelTo);
  if (!stageRow) {
    return { key: `lv:${realmLv}`, name: '' };
  }
  return { key: String(stageRow.stage), name: stageRow.name };
}

export function getTutorialRealmLevelTableRows(): TutorialRealmLevelTableRow[] {
  let previousMajorRealmKey = '';
  return [...LOCAL_EDITOR_CATALOG.realmLevels]
    .filter((entry) => Number.isFinite(entry.realmLv) && entry.realmLv > 0)
    .sort((left, right) => left.realmLv - right.realmLv)
    .map((entry) => {
      const realmLv = Math.max(1, Math.floor(entry.realmLv));
      const majorRealm = resolveMajorRealmName(realmLv);
      const repeatedMajorRealm = majorRealm.key === previousMajorRealmKey;
      previousMajorRealmKey = majorRealm.key;
      return {
        realmLv,
        displayName: entry.displayName || entry.name || `Lv.${realmLv}`,
        majorRealmName: majorRealm.name,
        repeatedMajorRealm,
        expToNext: Math.max(0, toFiniteInteger(entry.runtimeExpToNext ?? entry.expToNext, 0)),
      };
    });
}
