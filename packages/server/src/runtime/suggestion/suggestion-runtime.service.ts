// @ts-nocheck

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuggestionRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const crypto_1 = require("crypto");

const suggestion_persistence_service_1 = require("../../persistence/suggestion-persistence.service");

/** 建议反馈运行时：负责建议、投票、回复和状态同步。 */
let SuggestionRuntimeService = class SuggestionRuntimeService {
    /** 持久化服务，负责读写建议文档。 */
    suggestionPersistenceService;
    /** 当前全部建议。 */
    suggestions = [];
    /** 建议文档版本号。 */
    revision = 1;
    /** 串行化建议写操作。 */
    mutationQueue = Promise.resolve();
    /** 注入建议持久化服务。 */
    constructor(suggestionPersistenceService) {
        this.suggestionPersistenceService = suggestionPersistenceService;
    }
    /** 模块初始化时从持久化回填建议列表。 */
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
    /** 重新读取建议文档。 */
    async reloadFromPersistence() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const loaded = await this.suggestionPersistenceService.loadSuggestions();
        if (!loaded) {
            this.suggestions = [];
            this.revision = 1;
            return;
        }
        this.suggestions = loaded.suggestions.map((entry) => cloneSuggestion(entry));
        this.revision = loaded.revision;
    }
    /** 获取按时间和热度排序后的建议快照。 */
    getAll() {
        return this.suggestions
            .map((entry) => cloneSuggestion(entry))
            .sort((left, right) => compareSuggestions(left, right));
    }
    /** 创建一条新建议。 */
    async create(authorId, authorName, title, description) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedTitle = String(title ?? '').trim();

        const normalizedDescription = String(description ?? '').trim();
        if (!normalizedTitle || !normalizedDescription) {
            return null;
        }
        return this.runExclusive(async () => {

            const suggestion = {
                id: (0, crypto_1.randomUUID)(),
                authorId,
                authorName: authorName.trim() || authorId,
                title: normalizedTitle,
                description: normalizedDescription,
                status: 'pending',
                upvotes: [],
                downvotes: [],
                replies: [],
                authorLastReadGmReplyAt: 0,
                createdAt: Date.now(),
            };
            this.suggestions.push(suggestion);
            await this.persist();
            return cloneSuggestion(suggestion);
        });
    }
    /** 对建议进行赞成或反对投票。 */
    async vote(playerId, suggestionId, vote) {
        return this.runExclusive(async () => {

            const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
            if (!suggestion) {
                return null;
            }
            if (vote === 'up') {
                if (suggestion.upvotes.includes(playerId)) {
                    suggestion.upvotes = suggestion.upvotes.filter((entry) => entry !== playerId);
                }
                else {
                    suggestion.upvotes = [...suggestion.upvotes, playerId];
                    suggestion.downvotes = suggestion.downvotes.filter((entry) => entry !== playerId);
                }
            }
            else if (suggestion.downvotes.includes(playerId)) {
                suggestion.downvotes = suggestion.downvotes.filter((entry) => entry !== playerId);
            }
            else {
                suggestion.downvotes = [...suggestion.downvotes, playerId];
                suggestion.upvotes = suggestion.upvotes.filter((entry) => entry !== playerId);
            }
            await this.persist();
            return cloneSuggestion(suggestion);
        });
    }
    /** 为建议追加一条回复。 */
    async addReply(suggestionId, authorType, authorId, authorName, content) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedContent = String(content ?? '').trim();
        if (!normalizedContent) {
            return null;
        }
        return this.runExclusive(async () => {

            const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
            if (!suggestion) {
                return null;
            }
            if (authorType === 'author') {
                if (suggestion.authorId !== authorId) {
                    return null;
                }

                const lastReply = suggestion.replies[suggestion.replies.length - 1];
                if (!lastReply || lastReply.authorType !== 'gm') {
                    return null;
                }
                suggestion.authorLastReadGmReplyAt = lastReply.createdAt;
            }

            const reply = {
                id: (0, crypto_1.randomUUID)(),
                authorType,
                authorId,
                authorName: authorName.trim() || authorId,
                content: normalizedContent,
                createdAt: Date.now(),
            };
            suggestion.replies = [...suggestion.replies, reply];
            await this.persist();
            return cloneSuggestion(suggestion);
        });
    }
    /** 记录作者已读到最新 GM 回复的位置。 */
    async markRepliesRead(suggestionId, authorId) {
        return this.runExclusive(async () => {

            const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
            if (!suggestion || suggestion.authorId !== authorId) {
                return null;
            }

            const lastGmReplyAt = getLastGmReplyAt(suggestion.replies);
            if (lastGmReplyAt <= suggestion.authorLastReadGmReplyAt) {
                return cloneSuggestion(suggestion);
            }
            suggestion.authorLastReadGmReplyAt = lastGmReplyAt;
            await this.persist();
            return cloneSuggestion(suggestion);
        });
    }
    /** 把建议状态改成已完成。 */
    async markCompleted(suggestionId) {
        return this.updateStatus(suggestionId, 'completed');
    }
    /** 把建议状态恢复成待处理。 */
    async markPending(suggestionId) {
        return this.updateStatus(suggestionId, 'pending');
    }
    /** 删除一条建议。 */
    async remove(suggestionId) {
        return this.runExclusive(async () => {

            const before = this.suggestions.length;
            this.suggestions = this.suggestions.filter((entry) => entry.id !== suggestionId);
            if (this.suggestions.length === before) {
                return false;
            }
            await this.persist();
            return true;
        });
    }
    /** 更新建议状态并持久化。 */
    async updateStatus(suggestionId, status) {
        return this.runExclusive(async () => {

            const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
            if (!suggestion) {
                return null;
            }
            if (suggestion.status === status) {
                return cloneSuggestion(suggestion);
            }
            suggestion.status = status;
            await this.persist();
            return cloneSuggestion(suggestion);
        });
    }
    /** 把当前建议列表写回持久化层。 */
    async persist() {
        this.revision += 1;
        await this.suggestionPersistenceService.saveSuggestions({
            version: 1,
            revision: this.revision,
            suggestions: this.suggestions.map((entry) => cloneSuggestion(entry)),
        });
    }
    /** 顺序执行建议写操作，避免并发改写同一份数组。 */
    async runExclusive(action) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const previous = this.mutationQueue;

        let release;
        this.mutationQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await action();
        }
        finally {
            release();
        }
    }
};
exports.SuggestionRuntimeService = SuggestionRuntimeService;
exports.SuggestionRuntimeService = SuggestionRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [suggestion_persistence_service_1.SuggestionPersistenceService])
], SuggestionRuntimeService);
/**
 * cloneSuggestion：构建Suggestion。
 * @param suggestion 参数说明。
 * @returns 无返回值，直接更新Suggestion相关状态。
 */

function cloneSuggestion(suggestion) {
    return {
        ...suggestion,
        upvotes: [...suggestion.upvotes],
        downvotes: [...suggestion.downvotes],
        replies: suggestion.replies.map((reply) => ({ ...reply })),
    };
}
/**
 * getLastGmReplyAt：读取最近一次GMReplyAt。
 * @param replies 参数说明。
 * @returns 无返回值，完成LastGMReplyAt的读取/组装。
 */

function getLastGmReplyAt(replies) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let last = 0;
    for (const reply of replies) {
        if (reply.authorType === 'gm' && reply.createdAt > last) {
            last = reply.createdAt;
        }
    }
    return last;
}
/**
 * compareSuggestions：执行compareSuggestion相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compareSuggestion相关状态。
 */

function compareSuggestions(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left.status !== right.status) {
        return left.status === 'pending' ? -1 : 1;
    }

    const leftLastActivityAt = Math.max(left.createdAt, left.replies[left.replies.length - 1]?.createdAt ?? 0);

    const rightLastActivityAt = Math.max(right.createdAt, right.replies[right.replies.length - 1]?.createdAt ?? 0);
    if (rightLastActivityAt !== leftLastActivityAt) {
        return rightLastActivityAt - leftLastActivityAt;
    }

    const leftScore = left.upvotes.length - left.downvotes.length;

    const rightScore = right.upvotes.length - right.downvotes.length;
    if (rightScore !== leftScore) {
        return rightScore - leftScore;
    }
    return right.createdAt - left.createdAt;
}

export { SuggestionRuntimeService };
