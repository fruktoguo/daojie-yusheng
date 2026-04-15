import {
  Attributes,
  NumericRatioDivisors,
  NumericStats,
  ObservationInsight,
} from '@mud/shared';
import {
  OBSERVATION_BLIND_RATIO,
  OBSERVATION_FULL_RATIO,
} from '../constants/world/overview';

export interface ObservationTargetSnapshot {
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  spirit: number;
  stats: NumericStats;
  ratios: NumericRatioDivisors;
  attrs?: Attributes;
  realmLabel?: string;
}

export interface ObservationLineSpec {
  threshold: number;
  label: string;
  value: string;
}

export function formatWhole(value: number): string {
  return `${Math.max(0, Math.round(value))}`;
}

export function formatCurrentMax(current: number, max: number): string {
  return `${formatWhole(current)} / ${formatWhole(max)}`;
}

export function formatRate(value: number): string {
  const percent = value / 100;
  return `${percent.toFixed(percent % 1 === 0 ? 0 : percent % 0.1 === 0 ? 1 : 2)}%`;
}

export function formatCritDamage(value: number): string {
  const total = 200 + Math.max(0, value) / 10;
  return `${total.toFixed(total % 1 === 0 ? 0 : total % 0.1 === 0 ? 1 : 2)}%`;
}

export function buildObservationLineSpecs(
  snapshot: ObservationTargetSnapshot,
  includeResources: boolean,
): ObservationLineSpec[] {
  const lines: ObservationLineSpec[] = [];
  if (includeResources) {
    lines.push(
      { threshold: 0.18, label: '生命', value: formatCurrentMax(snapshot.hp, snapshot.maxHp) },
      { threshold: 0.24, label: '灵力', value: formatCurrentMax(snapshot.qi, snapshot.maxQi) },
    );
  }

  lines.push(
    { threshold: 0.32, label: '物理攻击', value: formatWhole(snapshot.stats.physAtk) },
    { threshold: 0.36, label: '物理防御', value: formatWhole(snapshot.stats.physDef) },
    { threshold: 0.4, label: '法术攻击', value: formatWhole(snapshot.stats.spellAtk) },
    { threshold: 0.44, label: '法术防御', value: formatWhole(snapshot.stats.spellDef) },
    { threshold: 0.52, label: '命中', value: formatWhole(snapshot.stats.hit) },
    { threshold: 0.56, label: '闪避', value: formatWhole(snapshot.stats.dodge) },
    { threshold: 0.62, label: '暴击', value: formatWhole(snapshot.stats.crit) },
    { threshold: 0.66, label: '免爆', value: formatWhole(snapshot.stats.antiCrit) },
    { threshold: 0.7, label: '暴击伤害', value: formatCritDamage(snapshot.stats.critDamage) },
    { threshold: 0.76, label: '破招', value: formatWhole(snapshot.stats.breakPower) },
    { threshold: 0.8, label: '化解', value: formatWhole(snapshot.stats.resolvePower) },
    { threshold: 0.84, label: '最大灵力输出速率', value: `${formatWhole(snapshot.stats.maxQiOutputPerTick)} / 息` },
    { threshold: 0.87, label: '灵力回复', value: `${formatRate(snapshot.stats.qiRegenRate)} / 息` },
    { threshold: 0.89, label: '生命回复', value: `${formatRate(snapshot.stats.hpRegenRate)} / 息` },
  );

  if (snapshot.realmLabel) {
    lines.push({ threshold: 0.9, label: '境界', value: snapshot.realmLabel });
  }

  if (snapshot.attrs) {
    lines.push(
      { threshold: 0.92, label: '体魄', value: formatWhole(snapshot.attrs.constitution) },
      { threshold: 0.94, label: '神识', value: formatWhole(snapshot.attrs.spirit) },
      { threshold: 0.96, label: '身法', value: formatWhole(snapshot.attrs.perception) },
      { threshold: 0.98, label: '根骨', value: formatWhole(snapshot.attrs.talent) },
      { threshold: 0.99, label: '悟性', value: formatWhole(snapshot.attrs.comprehension) },
      { threshold: 1, label: '气运', value: formatWhole(snapshot.attrs.luck) },
    );
  }

  return lines;
}

export function computeObservationProgress(viewerSpirit: number, targetSpirit: number): number {
  if (targetSpirit <= 0) return 1;
  const ratio = viewerSpirit / targetSpirit;
  if (ratio <= OBSERVATION_BLIND_RATIO) return 0;
  if (ratio >= OBSERVATION_FULL_RATIO) return 1;
  return Math.max(0, Math.min(1, (ratio - OBSERVATION_BLIND_RATIO) / (OBSERVATION_FULL_RATIO - OBSERVATION_BLIND_RATIO)));
}

export function resolveObservationClarity(progress: number): ObservationInsight['clarity'] {
  if (progress <= 0) return 'veiled';
  if (progress < 0.34) return 'blurred';
  if (progress < 0.68) return 'partial';
  if (progress < 1) return 'clear';
  return 'complete';
}

export function buildObservationVerdict(progress: number, selfView: boolean): string {
  if (selfView) {
    return '神识内照，经络与底蕴尽现。';
  }
  if (progress <= 0) {
    return '对方气机晦涩，神识难以穿透。';
  }
  if (progress < 0.34) {
    return '仅能捕捉几缕外泄气机，难辨真底。';
  }
  if (progress < 0.68) {
    return '攻守轮廓渐明，深层底蕴仍藏于雾中。';
  }
  if (progress < 1) {
    return '神识已触及其根底，大半虚实可辨。';
  }
  return '神识压过其身，诸般底细尽入眼底。';
}

export function buildObservationInsight(
  viewerSpirit: number,
  snapshot: ObservationTargetSnapshot,
  lineSpecs: ObservationLineSpec[],
  selfView = false,
): ObservationInsight {
  const progress = selfView ? 1 : computeObservationProgress(viewerSpirit, snapshot.spirit);
  return {
    clarity: resolveObservationClarity(progress),
    verdict: buildObservationVerdict(progress, selfView),
    lines: lineSpecs.map((line) => ({
      label: line.label,
      value: progress >= line.threshold ? line.value : '???',
    })),
  };
}

