import {
  CULTIVATE_EXP_PER_TICK,
  CULTIVATION_ACTION_ID,
  CULTIVATION_BUFF_DURATION,
  CULTIVATION_BUFF_ID,
  CULTIVATION_REALM_EXP_PER_TICK,
  buildWorldDarknessBuffState,
  type VisibleBuffState,
} from '@mud/shared';

// 玩家 buff 投影：将运行时 buff 状态转换为客户端可见状态
type TechniqueLike = {
  techId?: string | null;
  name?: string | null;
};

type ProjectablePlayerBuffState = {
  combat?: {
    cultivationActive?: boolean | null;
  } | null;
  buildingJob?: {
    buildingName?: string | null;
    remainingTicks?: number | null;
    totalTicks?: number | null;
    phase?: string | null;
  } | null;
  techniques?: {
    cultivatingTechId?: string | null;
    techniques?: TechniqueLike[] | null;
  } | null;
  buffs?: {
    buffs?: VisibleBuffState[] | null;
  } | null;
  attrs?: {
    numericStats?: {
      viewRange?: number | null;
    } | null;
  } | null;
  viewRange?: number | null;
  worldTime?: Parameters<typeof buildWorldDarknessBuffState>[0] | null;
  worldTimeBaseViewRange?: number | null;
};

/** 返回客户端可见的玩家 Buff 投影；修炼状态只在投影层合成，不写回运行时 Buff 真源。 */
export function projectVisiblePlayerBuffs(player: ProjectablePlayerBuffState): VisibleBuffState[] {
  const realBuffs = Array.isArray(player.buffs?.buffs)
    ? player.buffs.buffs
        .filter((buff) => buff.buffId !== CULTIVATION_BUFF_ID)
        .map((buff) => cloneVisibleBuffProjection(buff))
    : [];
  const cultivationBuff = buildCultivationBuffProjection(player);
  const buildingBuff = buildBuildingBuffProjection(player);
  const darknessBuff = buildDarknessBuffProjection(player);
  const projected = [
    ...realBuffs,
    ...(cultivationBuff ? [cultivationBuff] : []),
    ...(buildingBuff ? [buildingBuff] : []),
    ...(darknessBuff ? [darknessBuff] : []),
  ];
  projected.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
  return projected;
}

export function cloneVisibleBuffProjection(source: VisibleBuffState): VisibleBuffState {
  return {
    ...source,
    attrs: source.attrs ? { ...source.attrs } : undefined,
    stats: source.stats ? { ...source.stats } : undefined,
    qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
  };
}

function buildCultivationBuffProjection(player: ProjectablePlayerBuffState): VisibleBuffState | null {
  if (player.combat?.cultivationActive !== true) {
    return null;
  }
  const techniqueName = resolveCultivatingTechniqueName(player);
  return {
    buffId: CULTIVATION_BUFF_ID,
    name: '修炼中',
    desc: buildCultivationBuffDescription(techniqueName),
    shortMark: '修',
    category: 'buff',
    visibility: 'public',
    remainingTicks: CULTIVATION_BUFF_DURATION + 1,
    duration: CULTIVATION_BUFF_DURATION,
    stacks: 1,
    maxStacks: 1,
    sourceSkillId: CULTIVATION_ACTION_ID,
    sourceSkillName: '修炼',
    stats: {
      realmExpPerTick: CULTIVATION_REALM_EXP_PER_TICK,
      techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
    },
  };
}

function resolveCultivatingTechniqueName(player: ProjectablePlayerBuffState): string | null {
  const techId = typeof player.techniques?.cultivatingTechId === 'string'
    ? player.techniques.cultivatingTechId.trim()
    : '';
  if (!techId) {
    return null;
  }
  const technique = (player.techniques?.techniques ?? []).find((entry) => entry.techId === techId);
  const name = typeof technique?.name === 'string' ? technique.name.trim() : '';
  return name || techId;
}

function buildCultivationBuffDescription(techniqueName: string | null): string {
  if (techniqueName) {
    return `${techniqueName} 正在运转，每息获得境界修为与功法经验。`;
  }
  return '正在调息修炼，每息获得境界修为与功法经验。';
}

function buildBuildingBuffProjection(player: ProjectablePlayerBuffState): VisibleBuffState | null {
  const job = player.buildingJob;
  const remainingTicks = Math.max(0, Math.trunc(Number(job?.remainingTicks ?? 0) || 0));
  if (remainingTicks <= 0) {
    return null;
  }
  const totalTicks = Math.max(1, Math.trunc(Number(job?.totalTicks ?? remainingTicks) || remainingTicks || 1));
  const buildingName = typeof job?.buildingName === 'string' && job.buildingName.trim()
    ? job.buildingName.trim()
    : '建筑';
  const paused = job?.phase === 'paused';
  return {
    buffId: 'activity.building',
    name: paused ? '营造暂停' : '营造中',
    desc: paused
      ? `${buildingName} 的营造已暂停，尚余 ${remainingTicks} 息。`
      : `${buildingName} 正在营造，尚余 ${remainingTicks} 息。`,
    shortMark: '筑',
    category: 'buff',
    visibility: 'public',
    remainingTicks,
    duration: totalTicks,
    stacks: 1,
    maxStacks: 1,
    sourceSkillId: 'building:construct',
    sourceSkillName: '营造',
  };
}

function buildDarknessBuffProjection(player: ProjectablePlayerBuffState): VisibleBuffState | null {
  const baseViewRange = Number(player.worldTimeBaseViewRange ?? player.attrs?.numericStats?.viewRange ?? player.viewRange ?? 1);
  return buildWorldDarknessBuffState(player.worldTime, baseViewRange);
}
