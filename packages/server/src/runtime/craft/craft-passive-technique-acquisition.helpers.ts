/**
 * 技艺行动完成时的被动功法获取规则。
 *
 * 被动功法模板在启动期已由 ContentTemplateRepository 解析；这里仅建立一次按技艺和品阶
 * 的索引，tick 中使用原始行动时长反推概率，并把命中的功法作为可交易的通用功法书入包。
 */
import {
  CRAFT_SKILL_EXP_TICK_DIVISOR,
  computeLuckSuccessRateBonus,
  CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
  TECHNIQUE_GRADE_ORDER,
  type CraftEffectSkillKind,
  type TechniqueActivityNoticeMessage,
  type TechniqueGrade,
} from '@mud/shared';
import { resolvePlayerEffectiveLuck } from '../player/player-special-stat.helpers';

const CRAFT_PASSIVE_GRADES = ['mortal', 'yellow', 'mystic'] as const;
const CRAFT_PASSIVE_GRADE_SET = new Set<string>(CRAFT_PASSIVE_GRADES);
const CRAFT_PASSIVE_ACTION_LEVELS = {
  yellow: 23,
  mystic: 31,
} as const;

type CraftPassiveGrade = typeof CRAFT_PASSIVE_GRADES[number];

type CraftPassiveCandidate = {
  id: string;
  name: string;
  grade: CraftPassiveGrade;
  realmLv: number;
};

type TechniqueTemplateRepositoryPort = {
  listTechniqueTemplates?: () => Array<Record<string, unknown>>;
  techniqueTemplates?: Map<string, Record<string, unknown>>;
  createItem?: (itemId: string, count?: number) => Record<string, unknown> | null;
  normalizeItem?: (item: Record<string, unknown>) => unknown;
};

export type CraftPassiveTechniqueAcquisitionInput = {
  player: any;
  activityKind: CraftEffectSkillKind;
  actionLevel: number;
  skillLevel: number;
  baseActionTicks: number;
  actionCount?: number;
  contentTemplateRepository?: TechniqueTemplateRepositoryPort | null;
  playerRuntimeService?: {
    receiveInventoryItem?(playerId: string, item: Record<string, unknown>, options?: Record<string, unknown>): unknown;
  } | null;
  random?: () => number;
};

export type CraftPassiveTechniqueAcquisitionResult = {
  acquiredCount: number;
  inventoryChanged: boolean;
  messages: TechniqueActivityNoticeMessage[];
};

const repositoryCandidateCache = new WeakMap<object, Map<CraftEffectSkillKind, Map<CraftPassiveGrade, CraftPassiveCandidate>>>();

/**
 * 按“行动等级所属境界”锁定可获取的被动档位：
 * 1-22 只能获得凡人，23-30 只能获得黄阶，31 以上只能获得玄阶。
 */
export function resolveCraftPassiveGradeByActionLevel(actionLevel: unknown): CraftPassiveGrade {
  const level = Math.max(1, Math.floor(Number(actionLevel) || 1));
  if (level >= CRAFT_PASSIVE_ACTION_LEVELS.mystic) return 'mystic';
  if (level >= CRAFT_PASSIVE_ACTION_LEVELS.yellow) return 'yellow';
  return 'mortal';
}

/** 计算单次行动完成的被动功法获取概率。 */
export function computeCraftPassiveTechniqueAcquisitionProbability(input: {
  actionLevel: number;
  skillLevel: number;
  baseActionTicks: number;
  grade: CraftPassiveGrade;
  luck: number;
}): number {
  const actionTicks = Math.max(0, Number(input.baseActionTicks) || 0);
  const skillLevel = Math.max(1, Math.floor(Number(input.skillLevel) || 1));
  const gradeIndex = Math.max(0, TECHNIQUE_GRADE_ORDER.indexOf(input.grade as TechniqueGrade));
  const expectedTicks = skillLevel
    * (3 ** gradeIndex)
    * 4
    * CRAFT_SKILL_EXP_TICK_DIVISOR;
  if (actionTicks <= 0 || expectedTicks <= 0) return 0;

  // 幸运采用倍率增幅，避免把极小的基础概率直接加成到近乎必得。
  const luckMultiplier = 1 + Math.max(0, computeLuckSuccessRateBonus(Math.max(0, Number(input.luck) || 0)));
  return Math.min(1, Math.max(0, (actionTicks / expectedTicks) * luckMultiplier));
}

export function tryAcquireCraftPassiveTechnique(
  input: CraftPassiveTechniqueAcquisitionInput,
): CraftPassiveTechniqueAcquisitionResult {
  const repository = input.contentTemplateRepository;
  const runtime = input.playerRuntimeService;
  const playerId = typeof input.player?.playerId === 'string' ? input.player.playerId.trim() : '';
  if (!repository || !runtime || !playerId || typeof runtime.receiveInventoryItem !== 'function') {
    return emptyAcquisitionResult();
  }

  const candidate = getCraftPassiveCandidate(repository, input.activityKind, input.actionLevel);
  if (!candidate) return emptyAcquisitionResult();

  const actionCount = Math.max(0, Math.floor(Number(input.actionCount ?? 1) || 0));
  const baseActionTicks = Math.max(0, Number(input.baseActionTicks) || 0);
  if (actionCount <= 0 || baseActionTicks <= 0) return emptyAcquisitionResult();

  const probability = computeCraftPassiveTechniqueAcquisitionProbability({
    actionLevel: input.actionLevel,
    skillLevel: input.skillLevel,
    baseActionTicks,
    grade: candidate.grade,
    luck: resolvePlayerEffectiveLuck(input.player),
  });
  if (probability <= 0) return emptyAcquisitionResult();

  const random = input.random ?? Math.random;
  const messages: TechniqueActivityNoticeMessage[] = [];
  let acquiredCount = 0;
  for (let index = 0; index < actionCount; index += 1) {
    const roll = Number(random());
    if (!Number.isFinite(roll) || roll >= probability) continue;
    const book = createCraftPassiveTechniqueBook(repository, candidate);
    runtime.receiveInventoryItem(playerId, book, { inventoryOnlyStatistics: true });
    acquiredCount += 1;
    messages.push({
      kind: 'loot',
      key: 'notice.loot.obtained',
      vars: { itemName: typeof book.name === 'string' ? book.name : candidate.name },
      pills: [{ key: 'itemName', style: 'target' }],
    });
  }
  return {
    acquiredCount,
    inventoryChanged: acquiredCount > 0,
    messages,
  };
}

function getCraftPassiveCandidate(
  repository: TechniqueTemplateRepositoryPort,
  activityKind: CraftEffectSkillKind,
  actionLevel: number,
): CraftPassiveCandidate | null {
  const grade = resolveCraftPassiveGradeByActionLevel(actionLevel);
  const byKind = getCraftPassiveIndex(repository).get(activityKind);
  return byKind?.get(grade) ?? null;
}

function getCraftPassiveIndex(
  repository: TechniqueTemplateRepositoryPort,
): Map<CraftEffectSkillKind, Map<CraftPassiveGrade, CraftPassiveCandidate>> {
  const cached = repository && typeof repository === 'object'
    ? repositoryCandidateCache.get(repository as object)
    : undefined;
  if (cached) return cached;

  const index = new Map<CraftEffectSkillKind, Map<CraftPassiveGrade, CraftPassiveCandidate>>();
  const templates = typeof repository.listTechniqueTemplates === 'function'
    ? repository.listTechniqueTemplates()
    : repository.techniqueTemplates instanceof Map
      ? Array.from(repository.techniqueTemplates.values())
      : [];
  for (const template of templates) {
    const grade = normalizeCraftPassiveGrade(template?.grade);
    const id = normalizeText(template?.id);
    const name = normalizeText(template?.name);
    if (!grade || !id || !name) continue;
    const realmLv = Math.max(1, Math.floor(Number(template?.realmLv) || 1));
    for (const skill of asRecordArray(template?.skills)) {
      if (skill.active !== false) continue;
      for (const passiveEffect of asRecordArray(skill.passiveEffects)) {
        const craftStats = asRecord(passiveEffect.craftEffectStats);
        for (const activityKind of Object.keys(craftStats) as CraftEffectSkillKind[]) {
          if (!isCraftActivityKind(activityKind)) continue;
          let byGrade = index.get(activityKind);
          if (!byGrade) {
            byGrade = new Map<CraftPassiveGrade, CraftPassiveCandidate>();
            index.set(activityKind, byGrade);
          }
          if (!byGrade.has(grade)) {
            byGrade.set(grade, { id, name, grade, realmLv });
          }
        }
      }
    }
  }
  if (repository && typeof repository === 'object') {
    repositoryCandidateCache.set(repository as object, index);
  }
  return index;
}

function createCraftPassiveTechniqueBook(
  repository: TechniqueTemplateRepositoryPort,
  candidate: CraftPassiveCandidate,
): Record<string, unknown> {
  const template = typeof repository.createItem === 'function'
    ? repository.createItem(CUSTOM_TECHNIQUE_BOOK_ITEM_ID, 1)
    : null;
  const book: Record<string, unknown> = {
    ...(template ?? {}),
    itemId: CUSTOM_TECHNIQUE_BOOK_ITEM_ID,
    count: 1,
    type: 'skill_book',
    name: candidate.name,
    desc: `记载${candidate.name}，使用后可开始参悟。`,
    learnTechniqueId: candidate.id,
    grade: candidate.grade,
    level: candidate.realmLv,
  };
  const normalized = typeof repository.normalizeItem === 'function' ? repository.normalizeItem(book) : book;
  return normalized && typeof normalized === 'object' ? normalized as Record<string, unknown> : book;
}

function emptyAcquisitionResult(): CraftPassiveTechniqueAcquisitionResult {
  return { acquiredCount: 0, inventoryChanged: false, messages: [] };
}

function normalizeCraftPassiveGrade(value: unknown): CraftPassiveGrade | null {
  const grade = normalizeText(value);
  return CRAFT_PASSIVE_GRADE_SET.has(grade) ? grade as CraftPassiveGrade : null;
}

function isCraftActivityKind(value: string): value is CraftEffectSkillKind {
  return value === 'alchemy'
    || value === 'forging'
    || value === 'enhancement'
    || value === 'transmission'
    || value === 'gather'
    || value === 'mining'
    || value === 'building'
    || value === 'formation';
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function asRecordArray(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, any> => Boolean(entry) && typeof entry === 'object')
    : [];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
