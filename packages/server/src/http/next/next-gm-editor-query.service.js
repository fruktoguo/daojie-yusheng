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
exports.NextGmEditorQueryService = void 0;
const common_1 = require("@nestjs/common");
const content_template_repository_1 = require("../../content/content-template.repository");
const player_progression_service_1 = require("../../runtime/player/player-progression.service");
let NextGmEditorQueryService = class NextGmEditorQueryService {
    contentTemplateRepository;
    playerProgressionService;
    constructor(contentTemplateRepository, playerProgressionService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerProgressionService = playerProgressionService;
    }
    getEditorCatalog() {
        return {
            items: this.contentTemplateRepository.listItemTemplates(),
            techniques: this.contentTemplateRepository.listTechniqueTemplates(),
            realmLevels: this.playerProgressionService.listRealmLevels(),
            buffs: this.buildEditorBuffCatalog(),
        };
    }
    buildEditorBuffCatalog() {
        const catalog = new Map();
        const register = (input) => {
            const buffId = typeof input?.buffId === 'string' ? input.buffId.trim() : '';
            if (!buffId || catalog.has(buffId)) {
                return;
            }
            const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : buffId;
            const duration = Number.isFinite(input?.duration) ? Math.max(1, Math.trunc(Number(input.duration))) : 1;
            const maxStacks = Number.isFinite(input?.maxStacks) ? Math.max(1, Math.trunc(Number(input.maxStacks))) : 1;
            const shortMark = typeof input?.shortMark === 'string' && input.shortMark.trim()
                ? input.shortMark.trim().slice(0, 1)
                : (name[0] ?? buffId[0] ?? '益');
            catalog.set(buffId, {
                buffId,
                name,
                desc: typeof input?.desc === 'string' ? input.desc : '',
                shortMark,
                category: input?.category === 'debuff' ? 'debuff' : 'buff',
                visibility: typeof input?.visibility === 'string' && input.visibility ? input.visibility : 'public',
                remainingTicks: duration,
                duration,
                stacks: 1,
                maxStacks,
                sourceSkillId: typeof input?.sourceSkillId === 'string' && input.sourceSkillId.trim() ? input.sourceSkillId.trim() : 'gm:editor',
                sourceSkillName: typeof input?.sourceSkillName === 'string' && input.sourceSkillName.trim() ? input.sourceSkillName.trim() : 'GM 编辑器',
                realmLv: Number.isFinite(input?.realmLv) ? Math.max(1, Math.trunc(Number(input.realmLv))) : 1,
                color: typeof input?.color === 'string' && input.color.trim() ? input.color.trim() : undefined,
                attrs: input?.attrs && typeof input.attrs === 'object' ? { ...input.attrs } : undefined,
                attrMode: input?.attrMode,
                stats: input?.stats && typeof input.stats === 'object' ? { ...input.stats } : undefined,
                statMode: input?.statMode,
                qiProjection: Array.isArray(input?.qiProjection) ? input.qiProjection.map((entry) => ({ ...entry })) : undefined,
            });
        };
        for (const technique of this.contentTemplateRepository.listTechniqueTemplates()) {
            for (const skill of technique.skills ?? []) {
                for (const effect of skill.effects ?? []) {
                    if (effect?.type !== 'buff') {
                        continue;
                    }
                    register({
                        ...effect,
                        sourceSkillId: skill.id,
                        sourceSkillName: skill.name,
                        realmLv: technique.realmLv,
                        category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
                    });
                }
            }
        }
        for (const item of this.contentTemplateRepository.listItemTemplates()) {
            for (const buff of item.consumeBuffs ?? []) {
                register({
                    ...buff,
                    sourceSkillId: `item:${item.itemId}`,
                    sourceSkillName: item.name,
                    category: buff.category ?? 'buff',
                });
            }
            for (const effect of item.effects ?? []) {
                if (effect?.type !== 'timed_buff' || !effect.buff) {
                    continue;
                }
                register({
                    ...effect.buff,
                    sourceSkillId: `equip:${item.itemId}:${effect.effectId ?? 'effect'}`,
                    sourceSkillName: item.name,
                    category: effect.buff.category ?? 'buff',
                });
            }
        }
        return Array.from(catalog.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN') || left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
    }
};
exports.NextGmEditorQueryService = NextGmEditorQueryService;
exports.NextGmEditorQueryService = NextGmEditorQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_progression_service_1.PlayerProgressionService])
], NextGmEditorQueryService);
