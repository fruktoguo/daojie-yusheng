/** GM 取状态。 */
export interface GmGetStateRequestView {}

/** 主动请求最新建议列表。 */
export interface RequestSuggestionsView {}

/** GM 生成机器人。 */
export interface GmSpawnBotsRequestView {
/**
 * count：数量或计量字段。
 */

  count: number;
}

/** GM 移除机器人。 */
export interface GmRemoveBotsRequestView {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];  
  /**
 * all：all相关字段。
 */

  all?: boolean;
}

/** GM 调整玩家。 */
export interface GmUpdatePlayerRequestView {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * hp：hp相关字段。
 */

  hp: number;  
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle: boolean;
}

/** GM 重置玩家。 */
export interface GmResetPlayerRequestView {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;
}

/** 创建建议。 */
export interface CreateSuggestionRequestView {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * description：description相关字段。
 */

  description: string;
}

/** 建议投票。 */
export interface VoteSuggestionRequestView {
/**
 * suggestionId：suggestionID标识。
 */

  suggestionId: string;  
  /**
 * vote：vote相关字段。
 */

  vote: 'up' | 'down';
}

/** 回复建议。 */
export interface ReplySuggestionRequestView {
/**
 * suggestionId：suggestionID标识。
 */

  suggestionId: string;  
  /**
 * content：内容相关字段。
 */

  content: string;
}

/** 标记建议回复已读。 */
export interface MarkSuggestionRepliesReadRequestView {
/**
 * suggestionId：suggestionID标识。
 */

  suggestionId: string;
}

/** GM 标记建议完成。 */
export interface GmMarkSuggestionCompletedRequestView {
/**
 * suggestionId：suggestionID标识。
 */

  suggestionId: string;
}

/** GM 删除建议。 */
export interface GmRemoveSuggestionRequestView {
/**
 * suggestionId：suggestionID标识。
 */

  suggestionId: string;
}
