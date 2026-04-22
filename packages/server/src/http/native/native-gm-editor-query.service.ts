import { Inject, Injectable } from '@nestjs/common';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';
/**
 * LooseRecord：统一结构类型，保证协议与运行时一致性。
 */


type LooseRecord = Record<string, unknown>;
/**
 * EditorEffect：定义接口结构约束，明确可交付字段含义。
 */


interface EditorEffect extends LooseRecord {
/**
 * type：type相关字段。
 */

  type?: unknown;  
  /**
 * target：目标相关字段。
 */

  target?: unknown;  
  /**
 * category：category相关字段。
 */

  category?: unknown;  
  /**
 * effectId：effectID标识。
 */

  effectId?: unknown;  
  /**
 * buff：buff相关字段。
 */

  buff?: LooseRecord | null;
}
/**
 * EditorSkill：定义接口结构约束，明确可交付字段含义。
 */


interface EditorSkill {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * effects：effect相关字段。
 */

  effects?: EditorEffect[];
}
/**
 * EditorTechniqueTemplate：定义接口结构约束，明确可交付字段含义。
 */


interface EditorTechniqueTemplate {
/**
 * skills：技能相关字段。
 */

  skills?: EditorSkill[];  
  /**
 * realmLv：realmLv相关字段。
 */

  realmLv?: unknown;
}
/**
 * EditorItemTemplate：定义接口结构约束，明确可交付字段含义。
 */


interface EditorItemTemplate {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * consumeBuffs：consumeBuff相关字段。
 */

  consumeBuffs?: LooseRecord[];  
  /**
 * effects：effect相关字段。
 */

  effects?: EditorEffect[];
}
/**
 * ContentTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface ContentTemplateRepositoryLike {
  listItemTemplates(): EditorItemTemplate[];
  listTechniqueTemplates(): EditorTechniqueTemplate[];
}
/**
 * PlayerProgressionServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerProgressionServiceLike {
  listRealmLevels(): unknown;
}
/**
 * isRecord：判断Record是否满足条件。
 * @param value unknown 参数说明。
 * @returns 返回Record。
 */


function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null;
}
/**
 * NativeGmEditorQueryService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmEditorQueryService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository ContentTemplateRepositoryLike 参数说明。
 * @param playerProgressionService PlayerProgressionServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(ContentTemplateRepository) private readonly contentTemplateRepository: ContentTemplateRepositoryLike,
    @Inject(PlayerProgressionService) private readonly playerProgressionService: PlayerProgressionServiceLike,
  ) {}  
  /**
 * getEditorCatalog：读取Editor目录。
 * @returns 无返回值，完成Editor目录的读取/组装。
 */


  getEditorCatalog() {
    return {
      items: this.contentTemplateRepository.listItemTemplates(),
      techniques: this.contentTemplateRepository.listTechniqueTemplates(),
      realmLevels: this.playerProgressionService.listRealmLevels(),
      buffs: this.buildEditorBuffCatalog(),
    };
  }  
  /**
 * buildEditorBuffCatalog：构建并返回目标对象。
 * @returns 无返回值，直接更新EditorBuff目录相关状态。
 */


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
