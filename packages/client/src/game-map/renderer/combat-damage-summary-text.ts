import { formatDisplayInteger, type CombatDamageSummaryGroup, type CombatEffectDamageSummary } from '@mud/shared';

export function formatCombatDamageSummaryEffect(effect: CombatEffectDamageSummary): string {
  const lines: string[] = [];
  const enemy = formatDamageSummaryGroup('敌', effect.enemy, '斩');
  const tile = formatDamageSummaryGroup('地', effect.tile, '毁');
  if (enemy) lines.push(enemy);
  if (tile) lines.push(tile);
  return lines.join('\n');
}

function formatDamageSummaryGroup(
  label: string,
  group: CombatDamageSummaryGroup | undefined,
  resultLabel: string,
): string {
  if (!group || group.targetCount <= 0) {
    return '';
  }
  const hit = group.hitCount === group.targetCount
    ? `x${formatDisplayInteger(group.hitCount)}`
    : `${formatDisplayInteger(group.hitCount)}/${formatDisplayInteger(group.targetCount)}`;
  const resultCount = label === '敌' ? group.defeatedCount : group.destroyedCount;
  const suffix = resultCount && resultCount > 0 ? ` ${resultLabel}${formatDisplayInteger(resultCount)}` : '';
  return `${label}${hit} -${formatDisplayInteger(group.totalDamage)}${suffix}`;
}
