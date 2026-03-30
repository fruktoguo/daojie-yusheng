/**
 * 服务端行动系统相关常量。
 */

/** 遁返初始出生点的行动 id。 */
export const RETURN_TO_SPAWN_ACTION_ID = 'travel:return_spawn';

/** 遁返初始出生点的调息时长（息）。 */
export const RETURN_TO_SPAWN_COOLDOWN_TICKS = 1800;

/** 遁返初始出生点的行动名称。 */
export const RETURN_TO_SPAWN_ACTION_NAME = '遁返云来';

/** 遁返初始出生点的行动描述。 */
export const RETURN_TO_SPAWN_ACTION_DESC = `催动归引灵符，立刻遁返云来镇落脚处，之后需调息 ${RETURN_TO_SPAWN_COOLDOWN_TICKS} 息。`;

/** 遁返初始出生点的完成提示。 */
export const RETURN_TO_SPAWN_SUCCESS_TEXT = '归引灵符化作清光，你已遁返云来镇落脚处。';
