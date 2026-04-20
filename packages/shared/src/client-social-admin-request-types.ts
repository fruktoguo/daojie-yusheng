/** GM 取状态。 */
export interface GmGetStateRequestView {}

/** 主动请求最新建议列表。 */
export interface RequestSuggestionsView {}

/** GM 生成机器人。 */
export interface GmSpawnBotsRequestView {
/**
 * count：GmSpawnBotsRequestView 内部字段。
 */

  count: number;
}

/** GM 移除机器人。 */
export interface GmRemoveBotsRequestView {
/**
 * playerIds：GmRemoveBotsRequestView 内部字段。
 */

  playerIds?: string[];  
  /**
 * all：GmRemoveBotsRequestView 内部字段。
 */

  all?: boolean;
}

/** GM 调整玩家。 */
export interface GmUpdatePlayerRequestView {
/**
 * playerId：GmUpdatePlayerRequestView 内部字段。
 */

  playerId: string;  
  /**
 * mapId：GmUpdatePlayerRequestView 内部字段。
 */

  mapId: string;  
  /**
 * x：GmUpdatePlayerRequestView 内部字段。
 */

  x: number;  
  /**
 * y：GmUpdatePlayerRequestView 内部字段。
 */

  y: number;  
  /**
 * hp：GmUpdatePlayerRequestView 内部字段。
 */

  hp: number;  
  /**
 * autoBattle：GmUpdatePlayerRequestView 内部字段。
 */

  autoBattle: boolean;
}

/** GM 重置玩家。 */
export interface GmResetPlayerRequestView {
/**
 * playerId：GmResetPlayerRequestView 内部字段。
 */

  playerId: string;
}

/** 创建建议。 */
export interface CreateSuggestionRequestView {
/**
 * title：CreateSuggestionRequestView 内部字段。
 */

  title: string;  
  /**
 * description：CreateSuggestionRequestView 内部字段。
 */

  description: string;
}

/** 建议投票。 */
export interface VoteSuggestionRequestView {
/**
 * suggestionId：VoteSuggestionRequestView 内部字段。
 */

  suggestionId: string;  
  /**
 * vote：VoteSuggestionRequestView 内部字段。
 */

  vote: 'up' | 'down';
}

/** 回复建议。 */
export interface ReplySuggestionRequestView {
/**
 * suggestionId：ReplySuggestionRequestView 内部字段。
 */

  suggestionId: string;  
  /**
 * content：ReplySuggestionRequestView 内部字段。
 */

  content: string;
}

/** 标记建议回复已读。 */
export interface MarkSuggestionRepliesReadRequestView {
/**
 * suggestionId：MarkSuggestionRepliesReadRequestView 内部字段。
 */

  suggestionId: string;
}

/** GM 标记建议完成。 */
export interface GmMarkSuggestionCompletedRequestView {
/**
 * suggestionId：GmMarkSuggestionCompletedRequestView 内部字段。
 */

  suggestionId: string;
}

/** GM 删除建议。 */
export interface GmRemoveSuggestionRequestView {
/**
 * suggestionId：GmRemoveSuggestionRequestView 内部字段。
 */

  suggestionId: string;
}
