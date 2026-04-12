"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuggestionRuntimeService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** crypto_1：定义该变量以承载业务值。 */
const crypto_1 = require("crypto");
/** suggestion_persistence_service_1：定义该变量以承载业务值。 */
const suggestion_persistence_service_1 = require("../../persistence/suggestion-persistence.service");
/** SuggestionRuntimeService：定义该变量以承载业务值。 */
let SuggestionRuntimeService = class SuggestionRuntimeService {
    suggestionPersistenceService;
    suggestions = [];
    revision = 1;
    mutationQueue = Promise.resolve();
/** 构造函数：执行实例初始化流程。 */
    constructor(suggestionPersistenceService) {
        this.suggestionPersistenceService = suggestionPersistenceService;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
/** reloadFromPersistence：执行对应的业务逻辑。 */
    async reloadFromPersistence() {
/** loaded：定义该变量以承载业务值。 */
        const loaded = await this.suggestionPersistenceService.loadSuggestions();
        if (!loaded) {
            this.suggestions = [];
            this.revision = 1;
            return;
        }
        this.suggestions = loaded.suggestions.map((entry) => cloneSuggestion(entry));
        this.revision = loaded.revision;
    }
/** getAll：执行对应的业务逻辑。 */
    getAll() {
        return this.suggestions
            .map((entry) => cloneSuggestion(entry))
            .sort((left, right) => compareSuggestions(left, right));
    }
/** create：执行对应的业务逻辑。 */
    async create(authorId, authorName, title, description) {
/** normalizedTitle：定义该变量以承载业务值。 */
        const normalizedTitle = String(title ?? '').trim();
/** normalizedDescription：定义该变量以承载业务值。 */
        const normalizedDescription = String(description ?? '').trim();
        if (!normalizedTitle || !normalizedDescription) {
            return null;
        }
        return this.runExclusive(async () => {
/** suggestion：定义该变量以承载业务值。 */
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
/** vote：执行对应的业务逻辑。 */
    async vote(playerId, suggestionId, vote) {
        return this.runExclusive(async () => {
/** suggestion：定义该变量以承载业务值。 */
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
/** addReply：执行对应的业务逻辑。 */
    async addReply(suggestionId, authorType, authorId, authorName, content) {
/** normalizedContent：定义该变量以承载业务值。 */
        const normalizedContent = String(content ?? '').trim();
        if (!normalizedContent) {
            return null;
        }
        return this.runExclusive(async () => {
/** suggestion：定义该变量以承载业务值。 */
            const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
            if (!suggestion) {
                return null;
            }
            if (authorType === 'author') {
                if (suggestion.authorId !== authorId) {
                    return null;
                }
/** lastReply：定义该变量以承载业务值。 */
                const lastReply = suggestion.replies[suggestion.replies.length - 1];
                if (!lastReply || lastReply.authorType !== 'gm') {
                    return null;
                }
                suggestion.authorLastReadGmReplyAt = lastReply.createdAt;
            }
/** reply：定义该变量以承载业务值。 */
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
/** markRepliesRead：执行对应的业务逻辑。 */
    async markRepliesRead(suggestionId, authorId) {
        return this.runExclusive(async () => {
/** suggestion：定义该变量以承载业务值。 */
            const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
            if (!suggestion || suggestion.authorId !== authorId) {
                return null;
            }
/** lastGmReplyAt：定义该变量以承载业务值。 */
            const lastGmReplyAt = getLastGmReplyAt(suggestion.replies);
            if (lastGmReplyAt <= suggestion.authorLastReadGmReplyAt) {
                return cloneSuggestion(suggestion);
            }
            suggestion.authorLastReadGmReplyAt = lastGmReplyAt;
            await this.persist();
            return cloneSuggestion(suggestion);
        });
    }
/** markCompleted：执行对应的业务逻辑。 */
    async markCompleted(suggestionId) {
        return this.updateStatus(suggestionId, 'completed');
    }
/** markPending：执行对应的业务逻辑。 */
    async markPending(suggestionId) {
        return this.updateStatus(suggestionId, 'pending');
    }
/** remove：执行对应的业务逻辑。 */
    async remove(suggestionId) {
        return this.runExclusive(async () => {
/** before：定义该变量以承载业务值。 */
            const before = this.suggestions.length;
            this.suggestions = this.suggestions.filter((entry) => entry.id !== suggestionId);
            if (this.suggestions.length === before) {
                return false;
            }
            await this.persist();
            return true;
        });
    }
/** updateStatus：执行对应的业务逻辑。 */
    async updateStatus(suggestionId, status) {
        return this.runExclusive(async () => {
/** suggestion：定义该变量以承载业务值。 */
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
/** persist：执行对应的业务逻辑。 */
    async persist() {
        this.revision += 1;
        await this.suggestionPersistenceService.saveSuggestions({
            version: 1,
            revision: this.revision,
            suggestions: this.suggestions.map((entry) => cloneSuggestion(entry)),
        });
    }
/** runExclusive：执行对应的业务逻辑。 */
    async runExclusive(action) {
/** previous：定义该变量以承载业务值。 */
        const previous = this.mutationQueue;
/** release：定义该变量以承载业务值。 */
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
/** cloneSuggestion：执行对应的业务逻辑。 */
function cloneSuggestion(suggestion) {
    return {
        ...suggestion,
        upvotes: [...suggestion.upvotes],
        downvotes: [...suggestion.downvotes],
        replies: suggestion.replies.map((reply) => ({ ...reply })),
    };
}
/** getLastGmReplyAt：执行对应的业务逻辑。 */
function getLastGmReplyAt(replies) {
/** last：定义该变量以承载业务值。 */
    let last = 0;
    for (const reply of replies) {
        if (reply.authorType === 'gm' && reply.createdAt > last) {
            last = reply.createdAt;
        }
    }
    return last;
}
/** compareSuggestions：执行对应的业务逻辑。 */
function compareSuggestions(left, right) {
    if (left.status !== right.status) {
        return left.status === 'pending' ? -1 : 1;
    }
/** leftLastActivityAt：定义该变量以承载业务值。 */
    const leftLastActivityAt = Math.max(left.createdAt, left.replies[left.replies.length - 1]?.createdAt ?? 0);
/** rightLastActivityAt：定义该变量以承载业务值。 */
    const rightLastActivityAt = Math.max(right.createdAt, right.replies[right.replies.length - 1]?.createdAt ?? 0);
    if (rightLastActivityAt !== leftLastActivityAt) {
        return rightLastActivityAt - leftLastActivityAt;
    }
/** leftScore：定义该变量以承载业务值。 */
    const leftScore = left.upvotes.length - left.downvotes.length;
/** rightScore：定义该变量以承载业务值。 */
    const rightScore = right.upvotes.length - right.downvotes.length;
    if (rightScore !== leftScore) {
        return rightScore - leftScore;
    }
    return right.createdAt - left.createdAt;
}
//# sourceMappingURL=suggestion-runtime.service.js.map
