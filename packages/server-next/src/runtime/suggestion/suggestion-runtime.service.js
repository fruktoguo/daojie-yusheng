"use strict";
/**
 * 建议运行时服务
 * 
 * 负责管理游戏内的玩家建议系统，包括：
 * - 建议的创建和管理
 * - 建议的持久化存储
 * - 建议的加载和刷新
 * - 建议的版本控制
 */
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
/**
 * 建议运行时服务类
 * 
 * 负责管理游戏内的玩家建议系统
 */
let SuggestionRuntimeService = class SuggestionRuntimeService {
    // ==================== 依赖注入的服务 ====================
    /** 建议持久化服务 */
    suggestionPersistenceService;
    
    // ==================== 建议管理 ====================
    /** 建议列表 */
    suggestions = [];
    /** 建议版本号 */
    revision = 1;
    
    // ==================== 操作队列 ====================
    /** 建议操作队列（用于串行化操作） */
    mutationQueue = Promise.resolve();
    /**
     * 构造函数
     * @param suggestionPersistenceService 建议持久化服务
     */
    constructor(suggestionPersistenceService) {
        this.suggestionPersistenceService = suggestionPersistenceService;
    }
    
    /**
     * 模块初始化回调
     * 
     * 从持久化存储加载所有建议
     */
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
    
    /**
     * 从持久化存储重新加载建议
     * 
     * 从持久化存储加载所有建议并更新内存中的建议列表
     */
    async reloadFromPersistence() {
        // 从持久化存储加载建议
        const loaded = await this.suggestionPersistenceService.loadSuggestions();
        
        // 如果加载失败，初始化为空列表
        if (!loaded) {
            this.suggestions = [];
            this.revision = 1;
            return;
        }
        
        // 克隆建议列表
        this.suggestions = loaded.suggestions.map((entry) => cloneSuggestion(entry));
        
        // 更新版本号
        this.revision = loaded.revision;
    }
    
    /**
     * 获取所有建议
     * 
     * @returns 排序后的建议列表
     */
    getAll() {
        return this.suggestions
            .map((entry) => cloneSuggestion(entry))
            .sort((left, right) => compareSuggestions(left, right));
    }
    
    /**
     * 创建新建议
     * 
     * @param authorId 作者ID
     * @param authorName 作者名称
     * @param title 建议标题
     * @param description 建议描述
     * @returns 创建的建议对象，如果标题或描述为空则返回null
     */
    async create(authorId, authorName, title, description) {
        // 规范化标题和描述
        const normalizedTitle = String(title ?? '').trim();
        const normalizedDescription = String(description ?? '').trim();
        
        // 检查标题和描述是否为空
        if (!normalizedTitle || !normalizedDescription) {
            return null;
        }
        
        // 在互斥锁中执行创建操作
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
    async addReply(suggestionId, authorType, authorId, authorName, content) {
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
    async markCompleted(suggestionId) {
        return this.updateStatus(suggestionId, 'completed');
    }
    async markPending(suggestionId) {
        return this.updateStatus(suggestionId, 'pending');
    }
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
    async persist() {
        this.revision += 1;
        await this.suggestionPersistenceService.saveSuggestions({
            version: 1,
            revision: this.revision,
            suggestions: this.suggestions.map((entry) => cloneSuggestion(entry)),
        });
    }
    async runExclusive(action) {
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
function cloneSuggestion(suggestion) {
    return {
        ...suggestion,
        upvotes: [...suggestion.upvotes],
        downvotes: [...suggestion.downvotes],
        replies: suggestion.replies.map((reply) => ({ ...reply })),
    };
}
function getLastGmReplyAt(replies) {
    let last = 0;
    for (const reply of replies) {
        if (reply.authorType === 'gm' && reply.createdAt > last) {
            last = reply.createdAt;
        }
    }
    return last;
}
function compareSuggestions(left, right) {
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
//# sourceMappingURL=suggestion-runtime.service.js.map
