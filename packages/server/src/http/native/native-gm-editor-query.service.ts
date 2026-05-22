/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 编辑器目录查询服务。
 * 提供内容模板和玩家进度配置的聚合视图，供 GM 面板编辑器页使用。
 */
import { Inject, Injectable } from '@nestjs/common';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';
/** 宽松记录类型，用于动态属性传递。 */
type LooseRecord = Record<string, unknown>;

/** 编辑器效果结构。 */
interface EditorEffect extends LooseRecord {
  type?: unknown;
  target?: unknown;
  category?: unknown;
  effectId?: unknown;
  buff?: LooseRecord | null;
}

/** 编辑器技能结构。 */
interface EditorSkill {
  id: string;
  name: string;
  effects?: EditorEffect[];
}

/** 编辑器功法模板结构。 */
interface EditorTechniqueTemplate {
  skills?: EditorSkill[];
  realmLv?: unknown;
}

/** 编辑器物品模板结构。 */
interface EditorItemTemplate {
  itemId: string;
  name: string;
  consumeBuffs?: LooseRecord[];
  effects?: EditorEffect[];
}

/** 内容模板仓储端口。 */
interface ContentTemplateRepositoryLike {
  listItemTemplates(): EditorItemTemplate[];
  listTechniqueTemplates(): EditorTechniqueTemplate[];
}

/** 玩家进度服务端口。 */
interface PlayerProgressionServiceLike {
  listRealmLevels(): unknown;
}

/** 判断值是否为非 null 对象。 */
function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null;
}

/** GM 编辑器目录查询服务：聚合物品、功法、境界和 buff 目录。 */
@Injectable()
export class NativeGmEditorQueryService {
  constructor(
    @Inject(ContentTemplateRepository) private readonly contentTemplateRepository: ContentTemplateRepositoryLike,
    @Inject(PlayerProgressionService) private readonly playerProgressionService: PlayerProgressionServiceLike,
  ) {}

  /** 返回编辑器所需的完整内容目录。 */
  getEditorCatalog() {
    return {
      items: this.contentTemplateRepository.listItemTemplates(),
      techniques: this.contentTemplateRepository.listTechniqueTemplates(),
      realmLevels: this.playerProgressionService.listRealmLevels(),
      buffs: this.buildEditorBuffCatalog(),
    };
  }  
  /** 从功法技能和物品效果中聚合所有 buff 模板，构建编辑器 buff 目录。 */
  private buildEditorBuffCatalog() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const catalog = new Map<string, LooseRecord>();
    const register = (input: LooseRecord | null | undefined) => {
      const buffId = typeof input?.buffId === 'string' ? input.buffId.trim() : '';
      if (!buffId || catalog.has(buffId)) {
        return;
      }

      const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : buffId;
      const duration = Number.isFinite(input?.duration) ? Math.max(1, Math.trunc(Number(input.duration))) : 1;
      const maxStacks = Number.isFinite(input?.maxStacks) ? Math.max(1, Math.trunc(Number(input.maxStacks))) : 1;
      const shortMark =
        typeof input?.shortMark === 'string' && input.shortMark.trim()
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
        sourceSkillId:
          typeof input?.sourceSkillId === 'string' && input.sourceSkillId.trim() ? input.sourceSkillId.trim() : 'gm:editor',
        sourceSkillName:
          typeof input?.sourceSkillName === 'string' && input.sourceSkillName.trim()
            ? input.sourceSkillName.trim()
            : 'GM 编辑器',
        realmLv: Number.isFinite(input?.realmLv) ? Math.max(1, Math.trunc(Number(input.realmLv))) : 1,
        color: typeof input?.color === 'string' && input.color.trim() ? input.color.trim() : undefined,
        attrs: isRecord(input?.attrs) ? { ...input.attrs } : undefined,
        attrMode: input?.attrMode,
        stats: isRecord(input?.stats) ? { ...input.stats } : undefined,
        statMode: input?.statMode,
        qiProjection: Array.isArray(input?.qiProjection)
          ? input.qiProjection.map((entry) => (isRecord(entry) ? { ...entry } : {}))
          : undefined,
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

    return Array.from(catalog.values()).sort(
      (left, right) =>
        String(left.name).localeCompare(String(right.name), 'zh-Hans-CN')
        || String(left.buffId).localeCompare(String(right.buffId), 'zh-Hans-CN'),
    );
  }
}
