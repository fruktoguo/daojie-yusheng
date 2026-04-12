import { TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';
import type {
  AlchemyIngredientSelection,
  AlchemyRecipeCatalogEntry,
  AlchemySkillState,
  PlayerAlchemyJob,
  PlayerAlchemyPreset,
  TechniqueGrade,
} from './types';

/** ALCHEMY_MAX_PRESET_COUNT：定义该变量以承载业务值。 */
export const ALCHEMY_MAX_PRESET_COUNT = 24;
/** ALCHEMY_PREPARATION_TICKS：定义该变量以承载业务值。 */
export const ALCHEMY_PREPARATION_TICKS = 10;
/** ALCHEMY_FURNACE_OUTPUT_COUNT：定义该变量以承载业务值。 */
export const ALCHEMY_FURNACE_OUTPUT_COUNT = 6;
/** DEFAULT_ALCHEMY_SKILL_EXP_TO_NEXT：定义该变量以承载业务值。 */
const DEFAULT_ALCHEMY_SKILL_EXP_TO_NEXT = 60;

/** clampUnitRate：执行对应的业务逻辑。 */
function clampUnitRate(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** normalizeAlchemyLevel：执行对应的业务逻辑。 */
function normalizeAlchemyLevel(value: number | undefined): number {
  return Math.max(1, Math.floor(Number(value) || 1));
}

/** normalizeAlchemyQuantity：执行对应的业务逻辑。 */
export function normalizeAlchemyQuantity(value: number | undefined): number {
  return Math.max(1, Math.floor(Number(value) || 1));
}

/** computeAlchemyBatchOutputCount：执行对应的业务逻辑。 */
export function computeAlchemyBatchOutputCount(outputCount: number | undefined): number {
  return computeAlchemyBatchOutputCountWithSize(outputCount, ALCHEMY_FURNACE_OUTPUT_COUNT);
}

/** computeAlchemyBatchOutputCountWithSize：执行对应的业务逻辑。 */
export function computeAlchemyBatchOutputCountWithSize(
  outputCount: number | undefined,
  furnaceOutputCount: number | undefined,
): number {
/** normalizedOutputCount：定义该变量以承载业务值。 */
  const normalizedOutputCount = Math.max(1, Math.floor(Number(outputCount) || 1));
/** normalizedFurnaceOutputCount：定义该变量以承载业务值。 */
  const normalizedFurnaceOutputCount = Math.max(1, Math.floor(Number(furnaceOutputCount) || ALCHEMY_FURNACE_OUTPUT_COUNT));
  return normalizedOutputCount * normalizedFurnaceOutputCount;
}

/** getAlchemySpiritStoneCost：执行对应的业务逻辑。 */
export function getAlchemySpiritStoneCost(
  recipeLevel: number | undefined,
  consumesSpiritStone = true,
): number {
  if (!consumesSpiritStone) {
    return 0;
  }
  return normalizeAlchemyLevel(recipeLevel);
}

/** computeAlchemyTotalJobTicks：执行对应的业务逻辑。 */
export function computeAlchemyTotalJobTicks(
  batchBrewTicks: number,
  quantity: number | undefined,
  preparationTicks = ALCHEMY_PREPARATION_TICKS,
): number {
/** normalizedBatchTicks：定义该变量以承载业务值。 */
  const normalizedBatchTicks = Math.max(1, Math.floor(Number(batchBrewTicks) || 1));
/** normalizedPreparationTicks：定义该变量以承载业务值。 */
  const normalizedPreparationTicks = Math.max(0, Math.floor(Number(preparationTicks) || 0));
  return normalizedPreparationTicks + (normalizedBatchTicks * normalizeAlchemyQuantity(quantity));
}

/** applyBoundedSuccessModifier：执行对应的业务逻辑。 */
function applyBoundedSuccessModifier(rate: number, modifier: number): number {
/** clampedRate：定义该变量以承载业务值。 */
  const clampedRate = clampUnitRate(rate);
  if (clampedRate >= 1) {
    return 1;
  }
  if (!Number.isFinite(modifier) || modifier === 0) {
    return clampedRate;
  }
  if (modifier > 0) {
    return clampUnitRate(1 - ((1 - clampedRate) * Math.max(0, 1 - modifier)));
  }
  return clampUnitRate(clampedRate * Math.max(0, 1 + modifier));
}

/** resolveAlchemyGradeValue：执行对应的业务逻辑。 */
export function resolveAlchemyGradeValue(grade: TechniqueGrade | undefined): number {
/** index：定义该变量以承载业务值。 */
  const index = TECHNIQUE_GRADE_ORDER.indexOf(grade ?? 'mortal');
  return Math.max(1, index + 1);
}

/** normalizeAlchemySkillState：执行对应的业务逻辑。 */
export function normalizeAlchemySkillState(
  value: unknown,
  fallbackExpToNext = DEFAULT_ALCHEMY_SKILL_EXP_TO_NEXT,
): AlchemySkillState {
  if (!value || typeof value !== 'object') {
    return {
      level: 1,
      exp: 0,
      expToNext: Math.max(0, Math.floor(Number(fallbackExpToNext) || DEFAULT_ALCHEMY_SKILL_EXP_TO_NEXT)),
    };
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<AlchemySkillState>;
/** level：定义该变量以承载业务值。 */
  const level = normalizeAlchemyLevel(candidate.level);
/** expToNext：定义该变量以承载业务值。 */
  const expToNext = Math.max(0, Math.floor(Number(candidate.expToNext) || fallbackExpToNext || DEFAULT_ALCHEMY_SKILL_EXP_TO_NEXT));
/** exp：定义该变量以承载业务值。 */
  const exp = expToNext > 0
    ? Math.max(0, Math.min(expToNext, Math.floor(Number(candidate.exp) || 0)))
    : 0;
  return { level, exp, expToNext };
}

/** computeAlchemyMaterialPower：执行对应的业务逻辑。 */
export function computeAlchemyMaterialPower(
  level: number | undefined,
  grade: TechniqueGrade | undefined,
  count = 1,
): number {
/** normalizedLevel：定义该变量以承载业务值。 */
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
/** normalizedCount：定义该变量以承载业务值。 */
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  return normalizedLevel * (resolveAlchemyGradeValue(grade) ** 2) * normalizedCount;
}

/** buildAlchemyIngredientCountMap：执行对应的业务逻辑。 */
export function buildAlchemyIngredientCountMap(
  ingredients: readonly AlchemyIngredientSelection[] | undefined,
): Map<string, number> {
/** map：定义该变量以承载业务值。 */
  const map = new Map<string, number>();
  for (const entry of ingredients ?? []) {
    if (!entry || typeof entry.itemId !== 'string') {
      continue;
    }
/** itemId：定义该变量以承载业务值。 */
    const itemId = entry.itemId.trim();
/** count：定义该变量以承载业务值。 */
    const count = Math.max(0, Math.floor(Number(entry.count) || 0));
    if (!itemId || count <= 0) {
      continue;
    }
    map.set(itemId, (map.get(itemId) ?? 0) + count);
  }
  return map;
}

/** isExactAlchemyRecipe：执行对应的业务逻辑。 */
export function isExactAlchemyRecipe(
  recipe: Pick<AlchemyRecipeCatalogEntry, 'ingredients'>,
  submitted: readonly AlchemyIngredientSelection[] | undefined,
): boolean {
/** submittedMap：定义该变量以承载业务值。 */
  const submittedMap = buildAlchemyIngredientCountMap(submitted);
  if (submittedMap.size !== recipe.ingredients.length) {
    return false;
  }
  for (const ingredient of recipe.ingredients) {
    if ((submittedMap.get(ingredient.itemId) ?? 0) !== ingredient.count) {
      return false;
    }
  }
  return true;
}

/** computeAlchemySubmittedPower：执行对应的业务逻辑。 */
export function computeAlchemySubmittedPower(
  recipe: Pick<AlchemyRecipeCatalogEntry, 'ingredients'>,
  submitted: readonly AlchemyIngredientSelection[] | undefined,
): number {
/** submittedMap：定义该变量以承载业务值。 */
  const submittedMap = buildAlchemyIngredientCountMap(submitted);
/** total：定义该变量以承载业务值。 */
  let total = 0;
  for (const ingredient of recipe.ingredients) {
    const count = submittedMap.get(ingredient.itemId) ?? 0;
    if (count <= 0) {
      continue;
    }
    total += ingredient.powerPerUnit * count;
  }
  return total;
}

/** computeAlchemyPowerRatio：执行对应的业务逻辑。 */
export function computeAlchemyPowerRatio(
  recipe: Pick<AlchemyRecipeCatalogEntry, 'fullPower' | 'ingredients'>,
  submitted: readonly AlchemyIngredientSelection[] | undefined,
): number {
  if (recipe.fullPower <= 0) {
    return 0;
  }
/** ratio：定义该变量以承载业务值。 */
  const ratio = computeAlchemySubmittedPower(recipe, submitted) / recipe.fullPower;
  return Math.max(0, Math.min(1, ratio));
}

/** computeAlchemySuccessRate：执行对应的业务逻辑。 */
export function computeAlchemySuccessRate(
  recipe: Pick<AlchemyRecipeCatalogEntry, 'fullPower' | 'ingredients'>,
  submitted: readonly AlchemyIngredientSelection[] | undefined,
): number {
  if (isExactAlchemyRecipe(recipe, submitted)) {
    return 1;
  }
/** ratio：定义该变量以承载业务值。 */
  const ratio = computeAlchemyPowerRatio(recipe, submitted);
  return Math.max(0, Math.min(1, ratio ** 2));
}

/** computeAlchemyAdjustedSuccessRate：执行对应的业务逻辑。 */
export function computeAlchemyAdjustedSuccessRate(
  baseRate: number,
  recipeLevel: number | undefined,
  alchemyLevel: number | undefined,
  furnaceSuccessRate = 0,
): number {
/** nextRate：定义该变量以承载业务值。 */
  let nextRate = clampUnitRate(baseRate);
/** normalizedRecipeLevel：定义该变量以承载业务值。 */
  const normalizedRecipeLevel = normalizeAlchemyLevel(recipeLevel);
/** normalizedAlchemyLevel：定义该变量以承载业务值。 */
  const normalizedAlchemyLevel = normalizeAlchemyLevel(alchemyLevel);
/** levelDelta：定义该变量以承载业务值。 */
  const levelDelta = normalizedRecipeLevel - normalizedAlchemyLevel;
  if (levelDelta > 0) {
    nextRate *= 0.9 ** levelDelta;
  } else if (levelDelta < 0) {
    nextRate = 1 - ((1 - nextRate) * (0.98 ** Math.abs(levelDelta)));
  }
  return applyBoundedSuccessModifier(nextRate, furnaceSuccessRate);
}

/** computeAlchemyBrewTicks：执行对应的业务逻辑。 */
export function computeAlchemyBrewTicks(
  baseBrewTicks: number,
  recipe: Pick<AlchemyRecipeCatalogEntry, 'fullPower' | 'ingredients'>,
  submitted: readonly AlchemyIngredientSelection[] | undefined,
  furnaceOutputCount = ALCHEMY_FURNACE_OUTPUT_COUNT,
): number {
/** normalizedBase：定义该变量以承载业务值。 */
  const normalizedBase = Math.max(1, Math.floor(Number(baseBrewTicks) || 1));
/** normalizedFurnaceOutputCount：定义该变量以承载业务值。 */
  const normalizedFurnaceOutputCount = Math.max(1, Math.floor(Number(furnaceOutputCount) || ALCHEMY_FURNACE_OUTPUT_COUNT));
  if (isExactAlchemyRecipe(recipe, submitted)) {
    return normalizedBase * normalizedFurnaceOutputCount;
  }
/** ratio：定义该变量以承载业务值。 */
  const ratio = computeAlchemyPowerRatio(recipe, submitted);
  return Math.max(1, Math.ceil(normalizedBase * Math.max(0, ratio))) * normalizedFurnaceOutputCount;
}

/** computeAlchemySpeedMultiplier：执行对应的业务逻辑。 */
export function computeAlchemySpeedMultiplier(
  recipeLevel: number | undefined,
  alchemyLevel: number | undefined,
  furnaceSpeedRate = 0,
): number {
/** normalizedRecipeLevel：定义该变量以承载业务值。 */
  const normalizedRecipeLevel = normalizeAlchemyLevel(recipeLevel);
/** normalizedAlchemyLevel：定义该变量以承载业务值。 */
  const normalizedAlchemyLevel = normalizeAlchemyLevel(alchemyLevel);
/** levelDelta：定义该变量以承载业务值。 */
  const levelDelta = normalizedRecipeLevel - normalizedAlchemyLevel;
/** multiplier：定义该变量以承载业务值。 */
  let multiplier = 1;
  if (levelDelta > 0) {
    multiplier *= 0.9 ** levelDelta;
  } else if (levelDelta < 0) {
    multiplier += Math.abs(levelDelta) * 0.02;
  }
  if (Number.isFinite(furnaceSpeedRate) && furnaceSpeedRate !== 0) {
    if (furnaceSpeedRate > 0) {
      multiplier += furnaceSpeedRate;
    } else {
      multiplier *= Math.max(0.05, 1 + furnaceSpeedRate);
    }
  }
  return Math.max(0.05, multiplier);
}

/** computeAlchemyAdjustedBrewTicks：执行对应的业务逻辑。 */
export function computeAlchemyAdjustedBrewTicks(
  baseBrewTicks: number,
  recipe: Pick<AlchemyRecipeCatalogEntry, 'fullPower' | 'ingredients'>,
  submitted: readonly AlchemyIngredientSelection[] | undefined,
  recipeLevel: number | undefined,
  alchemyLevel: number | undefined,
  furnaceSpeedRate = 0,
  furnaceOutputCount = ALCHEMY_FURNACE_OUTPUT_COUNT,
): number {
/** baseTicks：定义该变量以承载业务值。 */
  const baseTicks = computeAlchemyBrewTicks(baseBrewTicks, recipe, submitted, furnaceOutputCount);
/** speedMultiplier：定义该变量以承载业务值。 */
  const speedMultiplier = computeAlchemySpeedMultiplier(recipeLevel, alchemyLevel, furnaceSpeedRate);
  return Math.max(1, Math.ceil(baseTicks / speedMultiplier));
}

/** normalizeAlchemyIngredientSelections：执行对应的业务逻辑。 */
export function normalizeAlchemyIngredientSelections(
  value: unknown,
): AlchemyIngredientSelection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(buildAlchemyIngredientCountMap(
    value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
/** candidate：定义该变量以承载业务值。 */
        const candidate = entry as Partial<AlchemyIngredientSelection>;
        return {
/** itemId：定义该变量以承载业务值。 */
          itemId: typeof candidate.itemId === 'string' ? candidate.itemId : '',
          count: Number(candidate.count ?? 0),
        };
      })
      .filter((entry): entry is AlchemyIngredientSelection => Boolean(entry)),
  ).entries()).map(([itemId, count]) => ({ itemId, count }));
}

/** normalizePlayerAlchemyPreset：执行对应的业务逻辑。 */
export function normalizePlayerAlchemyPreset(value: unknown): PlayerAlchemyPreset | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<PlayerAlchemyPreset>;
/** presetId：定义该变量以承载业务值。 */
  const presetId = typeof candidate.presetId === 'string' ? candidate.presetId.trim() : '';
/** recipeId：定义该变量以承载业务值。 */
  const recipeId = typeof candidate.recipeId === 'string' ? candidate.recipeId.trim() : '';
/** name：定义该变量以承载业务值。 */
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!presetId || !recipeId || !name) {
    return null;
  }
  return {
    presetId,
    recipeId,
    name,
    ingredients: normalizeAlchemyIngredientSelections(candidate.ingredients),
    updatedAt: Math.max(0, Math.floor(Number(candidate.updatedAt) || 0)),
  };
}

/** normalizePlayerAlchemyPresets：执行对应的业务逻辑。 */
export function normalizePlayerAlchemyPresets(value: unknown): PlayerAlchemyPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }
/** seen：定义该变量以承载业务值。 */
  const seen = new Set<string>();
/** result：定义该变量以承载业务值。 */
  const result: PlayerAlchemyPreset[] = [];
  for (const entry of value) {
    const preset = normalizePlayerAlchemyPreset(entry);
    if (!preset || seen.has(preset.presetId)) {
      continue;
    }
    seen.add(preset.presetId);
    result.push(preset);
    if (result.length >= ALCHEMY_MAX_PRESET_COUNT) {
      break;
    }
  }
  return result;
}

/** normalizePlayerAlchemyJob：执行对应的业务逻辑。 */
export function normalizePlayerAlchemyJob(value: unknown): PlayerAlchemyJob | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<PlayerAlchemyJob>;
/** recipeId：定义该变量以承载业务值。 */
  const recipeId = typeof candidate.recipeId === 'string' ? candidate.recipeId.trim() : '';
/** outputItemId：定义该变量以承载业务值。 */
  const outputItemId = typeof candidate.outputItemId === 'string' ? candidate.outputItemId.trim() : '';
  if (!recipeId || !outputItemId) {
    return null;
  }
/** totalTicks：定义该变量以承载业务值。 */
  const totalTicks = Math.max(1, Math.floor(Number(candidate.totalTicks) || 0));
/** remainingTicks：定义该变量以承载业务值。 */
  const remainingTicks = Math.max(0, Math.min(totalTicks, Math.floor(Number(candidate.remainingTicks) || 0)));
  return {
    recipeId,
    outputItemId,
    outputCount: Math.max(1, Math.floor(Number(candidate.outputCount) || 1)),
    quantity: normalizeAlchemyQuantity(candidate.quantity),
    completedCount: Math.max(0, Math.floor(Number(candidate.completedCount) || 0)),
    successCount: Math.max(0, Math.floor(Number(candidate.successCount) || 0)),
    failureCount: Math.max(0, Math.floor(Number(candidate.failureCount) || 0)),
    ingredients: normalizeAlchemyIngredientSelections(candidate.ingredients),
/** phase：定义该变量以承载业务值。 */
    phase: candidate.phase === 'preparing'
      ? 'preparing'
      : candidate.phase === 'paused'
        ? 'paused'
        : 'brewing',
    preparationTicks: Math.max(0, Math.floor(Number(candidate.preparationTicks) || ALCHEMY_PREPARATION_TICKS)),
    batchBrewTicks: Math.max(1, Math.floor(Number(candidate.batchBrewTicks) || 1)),
    currentBatchRemainingTicks: Math.max(0, Math.floor(Number(candidate.currentBatchRemainingTicks) || 0)),
    pausedTicks: Math.max(0, Math.floor(Number(candidate.pausedTicks) || 0)),
    spiritStoneCost: Math.max(0, Math.floor(Number(candidate.spiritStoneCost) || 0)),
    totalTicks,
    remainingTicks,
    successRate: Math.max(0, Math.min(1, Number(candidate.successRate) || 0)),
/** exactRecipe：定义该变量以承载业务值。 */
    exactRecipe: candidate.exactRecipe === true,
    startedAt: Math.max(0, Math.floor(Number(candidate.startedAt) || 0)),
  };
}

