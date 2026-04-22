/**
 * GM 面板表单与筛选选项常量。
 */

import {
  Direction,
  DIRECTION_LABELS,
  QUEST_LINE_KEYS,
  QUEST_LINE_LABELS,
  QUEST_OBJECTIVE_TYPE_KEYS,
  QUEST_OBJECTIVE_TYPE_LABELS,
  QUEST_STATUS_KEYS,
  QUEST_STATUS_LABELS,
  TechniqueRealm,
  TECHNIQUE_REALM_LABELS,
} from '@mud/shared';

/** GM 面板中的朝向选项。 */
export const GM_FACING_OPTIONS = ([
  Direction.North,
  Direction.South,
  Direction.East,
  Direction.West,
] as const).map((value) => ({
  value,
  label: DIRECTION_LABELS[value],
}));

/** GM 面板中的功法境界顺序。 */
export const GM_TECHNIQUE_REALM_ORDER: readonly TechniqueRealm[] = [
  TechniqueRealm.Entry,
  TechniqueRealm.Minor,
  TechniqueRealm.Major,
  TechniqueRealm.Perfection,
];

/** GM 面板中的功法境界选项。 */
export const GM_TECHNIQUE_REALM_OPTIONS = GM_TECHNIQUE_REALM_ORDER.map((value) => ({
  value,
  label: TECHNIQUE_REALM_LABELS[value],
}));

/** GM 面板中的任务线选项。 */
export const GM_QUEST_LINE_OPTIONS = QUEST_LINE_KEYS.map((value) => ({
  value,
  label: QUEST_LINE_LABELS[value],
}));

/** GM 面板中的任务状态选项。 */
export const GM_QUEST_STATUS_OPTIONS = QUEST_STATUS_KEYS.map((value) => ({
  value,
  label: QUEST_STATUS_LABELS[value],
}));

/** GM 面板中的任务目标类型选项。 */
export const GM_QUEST_OBJECTIVE_TYPE_OPTIONS = QUEST_OBJECTIVE_TYPE_KEYS.map((value) => ({
  value,
  label: QUEST_OBJECTIVE_TYPE_LABELS[value],
}));
