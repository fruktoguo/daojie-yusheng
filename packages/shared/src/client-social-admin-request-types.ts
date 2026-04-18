/** GM 取状态。 */
export interface GmGetStateRequestView {}

/** 主动请求最新建议列表。 */
export interface RequestSuggestionsView {}

/** GM 生成机器人。 */
export interface GmSpawnBotsRequestView {
  count: number;
}

/** GM 移除机器人。 */
export interface GmRemoveBotsRequestView {
  playerIds?: string[];
  all?: boolean;
}

/** GM 调整玩家。 */
export interface GmUpdatePlayerRequestView {
  playerId: string;
  mapId: string;
  x: number;
  y: number;
  hp: number;
  autoBattle: boolean;
}

/** GM 重置玩家。 */
export interface GmResetPlayerRequestView {
  playerId: string;
}

/** 创建建议。 */
export interface CreateSuggestionRequestView {
  title: string;
  description: string;
}

/** 建议投票。 */
export interface VoteSuggestionRequestView {
  suggestionId: string;
  vote: 'up' | 'down';
}

/** 回复建议。 */
export interface ReplySuggestionRequestView {
  suggestionId: string;
  content: string;
}

/** 标记建议回复已读。 */
export interface MarkSuggestionRepliesReadRequestView {
  suggestionId: string;
}

/** GM 标记建议完成。 */
export interface GmMarkSuggestionCompletedRequestView {
  suggestionId: string;
}

/** GM 删除建议。 */
export interface GmRemoveSuggestionRequestView {
  suggestionId: string;
}
