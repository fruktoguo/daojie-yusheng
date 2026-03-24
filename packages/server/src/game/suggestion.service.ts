/**
 * 玩家建议反馈服务：建议的创建、投票、完成、删除，持久化到 PostgreSQL
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import { promises as fsAsync } from 'fs';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Suggestion, SuggestionStatus } from '@mud/shared';
import { SuggestionEntity } from '../database/entities/suggestion.entity';
import { resolveServerDataPath } from '../common/data-path';

@Injectable()
export class SuggestionService implements OnModuleInit {
  private suggestions: Suggestion[] = [];
  private readonly logger = new Logger(SuggestionService.name);
  private readonly legacyFilePath = resolveServerDataPath('runtime', 'suggestions.json');

  constructor(
    @InjectRepository(SuggestionEntity)
    private readonly suggestionRepo: Repository<SuggestionEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      await this.importLegacyFileIfNeeded();
      await this.refreshCache();
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      this.suggestions = [];
    }
  }

  private async refreshCache(): Promise<void> {
    const entities = await this.suggestionRepo.find({
      order: {
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
    this.suggestions = entities.map((entity) => this.toSuggestion(entity));
  }

  private async importLegacyFileIfNeeded(): Promise<void> {
    const persistedCount = await this.suggestionRepo.count();
    if (persistedCount > 0 || !fs.existsSync(this.legacyFilePath)) {
      return;
    }

    try {
      const raw = await fsAsync.readFile(this.legacyFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const suggestions = this.normalizeLegacySuggestions(parsed);
      if (suggestions.length === 0) {
        return;
      }
      await this.suggestionRepo.save(suggestions.map((suggestion) => this.suggestionRepo.create(suggestion)));
      this.logger.log(`已从旧文件导入 ${suggestions.length} 条建议到 PostgreSQL`);
    } catch (error) {
      console.error('Failed to import legacy suggestions:', error);
    }
  }

  /** 获取所有建议 */
  getAll(): Suggestion[] {
    return this.suggestions.map((suggestion) => ({
      ...suggestion,
      upvotes: [...suggestion.upvotes],
      downvotes: [...suggestion.downvotes],
    }));
  }

  /** 创建新建议 */
  async create(authorId: string, authorName: string, title: string, description: string): Promise<Suggestion> {
    const suggestion = this.suggestionRepo.create({
      id: randomUUID(),
      authorId,
      authorName,
      title,
      description,
      status: 'pending',
      upvotes: [],
      downvotes: [],
      createdAt: Date.now(),
    });
    const saved = await this.suggestionRepo.save(suggestion);
    const result = this.toSuggestion(saved);
    this.suggestions.push(result);
    return result;
  }

  /** 对建议投票（赞成/反对，重复点击取消） */
  async vote(playerId: string, suggestionId: string, vote: 'up' | 'down'): Promise<Suggestion | null> {
    const suggestion = await this.suggestionRepo.findOne({ where: { id: suggestionId } });
    if (!suggestion) return null;

    if (vote === 'up') {
      // 如果已经点过赞，则是取消
      if (suggestion.upvotes.includes(playerId)) {
        suggestion.upvotes = suggestion.upvotes.filter((id) => id !== playerId);
      } else {
        suggestion.upvotes.push(playerId);
        // 同时移除反对票
        suggestion.downvotes = suggestion.downvotes.filter((id) => id !== playerId);
      }
    } else {
      // 如果已经点过踩，则是取消
      if (suggestion.downvotes.includes(playerId)) {
        suggestion.downvotes = suggestion.downvotes.filter((id) => id !== playerId);
      } else {
        suggestion.downvotes.push(playerId);
        // 同时移除赞成票
        suggestion.upvotes = suggestion.upvotes.filter((id) => id !== playerId);
      }
    }

    const saved = await this.suggestionRepo.save(suggestion);
    const result = this.toSuggestion(saved);
    this.replaceCachedSuggestion(result);
    return result;
  }

  /** 标记建议为已完成 */
  async markCompleted(suggestionId: string): Promise<Suggestion | null> {
    const suggestion = await this.suggestionRepo.findOne({ where: { id: suggestionId } });
    if (!suggestion) return null;

    suggestion.status = 'completed';
    const saved = await this.suggestionRepo.save(suggestion);
    const result = this.toSuggestion(saved);
    this.replaceCachedSuggestion(result);
    return result;
  }

  /** 删除建议 */
  async remove(suggestionId: string): Promise<boolean> {
    const result = await this.suggestionRepo.delete({ id: suggestionId });
    if (!result.affected) return false;

    this.suggestions = this.suggestions.filter((suggestion) => suggestion.id !== suggestionId);
    return true;
  }

  private replaceCachedSuggestion(updated: Suggestion): void {
    const index = this.suggestions.findIndex((suggestion) => suggestion.id === updated.id);
    if (index === -1) {
      this.suggestions.push(updated);
      return;
    }
    this.suggestions[index] = updated;
  }

  private toSuggestion(entity: SuggestionEntity): Suggestion {
    return {
      id: entity.id,
      authorId: entity.authorId,
      authorName: entity.authorName,
      title: entity.title,
      description: entity.description,
      status: entity.status,
      upvotes: Array.isArray(entity.upvotes) ? [...entity.upvotes] : [],
      downvotes: Array.isArray(entity.downvotes) ? [...entity.downvotes] : [],
      createdAt: Number(entity.createdAt),
    };
  }

  private normalizeLegacySuggestions(value: unknown): Suggestion[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((entry) => {
      const normalized = this.normalizeLegacySuggestion(entry);
      return normalized ? [normalized] : [];
    });
  }

  private normalizeLegacySuggestion(value: unknown): Suggestion | null {
    if (!this.isPlainObject(value)) {
      return null;
    }
    const {
      id,
      authorId,
      authorName,
      title,
      description,
      status,
      upvotes,
      downvotes,
      createdAt,
    } = value;
    if (
      typeof id !== 'string'
      || typeof authorId !== 'string'
      || typeof authorName !== 'string'
      || typeof title !== 'string'
      || typeof description !== 'string'
      || !this.isSuggestionStatus(status)
      || !Number.isFinite(createdAt)
    ) {
      return null;
    }
    return {
      id,
      authorId,
      authorName,
      title,
      description,
      status,
      upvotes: this.normalizePlayerIds(upvotes),
      downvotes: this.normalizePlayerIds(downvotes),
      createdAt: Number(createdAt),
    };
  }

  private normalizePlayerIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))];
  }

  private isSuggestionStatus(value: unknown): value is SuggestionStatus {
    return value === 'pending' || value === 'completed';
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
