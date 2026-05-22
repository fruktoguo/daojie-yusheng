/**
 * 本文件实现服务端内容模板 Registry，负责把启动期解析后的配置变成运行期只读引用。
 *
 * 维护时要保持模板冻结和实例工厂边界，避免 tick 热路径复制大对象或手写模板字段。
 */
import { Injectable } from '@nestjs/common';
import { deepFreezeTemplate } from '../../../content/registries/template-freeze';

@Injectable()
export class QuestTemplateRegistry {
  readonly questSourceById = new Map<string, any>();

  loadAll(): void {
    this.questSourceById.clear();
  }

  registerMapTemplate(template: any): void {
    const mapId = String(template?.id ?? '').trim();
    if (!mapId) {
      return;
    }
    for (const npc of template.npcs ?? []) {
      for (const quest of npc.quests ?? []) {
        const questId = String(quest?.id ?? '').trim();
        if (!questId || this.questSourceById.has(questId)) {
          continue;
        }
        this.questSourceById.set(questId, deepFreezeTemplate({
          quest,
          giverNpcId: npc.id,
          giverNpcName: npc.name,
          giverMapId: mapId,
          giverMapName: template.name,
          giverX: npc.x,
          giverY: npc.y,
        }));
      }
    }
  }

  getRef(questId: string): Readonly<any> {
    const source = this.getQuestSource(questId);
    if (!source) {
      throw new Error(`未找到任务模板：${questId}`);
    }
    return source.quest;
  }

  tryGetRef(questId: string): Readonly<any> | undefined {
    return this.getQuestSource(questId)?.quest;
  }

  getQuestSource(questId: string): Readonly<any> | null {
    return this.questSourceById.get(String(questId ?? '').trim()) ?? null;
  }

  getRewards(questId: string): readonly any[] {
    return this.tryGetRef(questId)?.rewards ?? [];
  }

  getNarrative(questId: string): Readonly<any> | null {
    const quest = this.tryGetRef(questId);
    if (!quest) {
      return null;
    }
    return {
      title: quest.title,
      desc: quest.desc,
      dialogue: quest.dialogue,
      completionText: quest.completionText,
    };
  }

  listIds(): readonly string[] {
    return Array.from(this.questSourceById.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }
}
