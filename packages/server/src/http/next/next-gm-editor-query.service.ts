import { Inject, Injectable } from '@nestjs/common';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';

type LooseRecord = Record<string, unknown>;

interface EditorEffect extends LooseRecord {
  type?: unknown;
  target?: unknown;
  category?: unknown;
  effectId?: unknown;
  buff?: LooseRecord | null;
}

interface EditorSkill {
  id: string;
  name: string;
  effects?: EditorEffect[];
}

interface EditorTechniqueTemplate {
  skills?: EditorSkill[];
  realmLv?: unknown;
}

interface EditorItemTemplate {
  itemId: string;
  name: string;
  consumeBuffs?: LooseRecord[];
  effects?: EditorEffect[];
}

interface ContentTemplateRepositoryLike {
  listItemTemplates(): EditorItemTemplate[];
  listTechniqueTemplates(): EditorTechniqueTemplate[];
}

interface PlayerProgressionServiceLike {
  listRealmLevels(): unknown;
}

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class NextGmEditorQueryService {
  constructor(
    @Inject(ContentTemplateRepository) private readonly contentTemplateRepository: ContentTemplateRepositoryLike,
    @Inject(PlayerProgressionService) private readonly playerProgressionService: PlayerProgressionServiceLike,
  ) {}

  getEditorCatalog() {
    return {
      items: this.contentTemplateRepository.listItemTemplates(),
      techniques: this.contentTemplateRepository.listTechniqueTemplates(),
      realmLevels: this.playerProgressionService.listRealmLevels(),
      buffs: this.buildEditorBuffCatalog(),
    };
  }

  private buildEditorBuffCatalog() {
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
