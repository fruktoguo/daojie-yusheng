"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextGmSuggestionQueryService = void 0;
const common_1 = require("@nestjs/common");
const suggestion_runtime_service_1 = require("../../runtime/suggestion/suggestion-runtime.service");
let NextGmSuggestionQueryService = class NextGmSuggestionQueryService {
    suggestionRuntimeService;
    constructor(suggestionRuntimeService) {
        this.suggestionRuntimeService = suggestionRuntimeService;
    }
    getSuggestions(query) {
        const page = Math.max(1, Math.trunc(Number(query?.page) || 1));
        const pageSize = clamp(Math.trunc(Number(query?.pageSize) || 10), 1, 50);
        const keyword = typeof query?.keyword === 'string' ? query.keyword.trim() : '';
        const normalizedKeyword = keyword.toLowerCase();
        const filtered = this.suggestionRuntimeService.getAll().filter((entry) => {
            if (!normalizedKeyword) {
                return true;
            }
            return entry.title.toLowerCase().includes(normalizedKeyword)
                || entry.description.toLowerCase().includes(normalizedKeyword)
                || entry.authorName.toLowerCase().includes(normalizedKeyword)
                || entry.replies.some((reply) => reply.content.toLowerCase().includes(normalizedKeyword));
        });
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = clamp(page, 1, totalPages);
        const start = (safePage - 1) * pageSize;
        const items = filtered.slice(start, start + pageSize);
        return {
            items,
            total,
            page: safePage,
            pageSize,
            totalPages,
            keyword,
        };
    }
};
exports.NextGmSuggestionQueryService = NextGmSuggestionQueryService;
exports.NextGmSuggestionQueryService = NextGmSuggestionQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [suggestion_runtime_service_1.SuggestionRuntimeService])
], NextGmSuggestionQueryService);
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
