/**
 * 本文件实现服务端内容模板 Registry，负责把启动期解析后的配置变成运行期只读引用。
 *
 * 维护时要保持模板冻结和实例工厂边界，避免 tick 热路径复制大对象或手写模板字段。
 */
import { Injectable } from '@nestjs/common';
import { deepFreezeTemplate } from '../../../content/registries/template-freeze';

@Injectable()
export class ContainerTemplateRegistry {
  readonly containerTemplates = new Map<string, any>();
  private readonly containerIdsByMapId = new Map<string, string[]>();

  loadAll(): void {
    this.containerTemplates.clear();
    this.containerIdsByMapId.clear();
  }

  registerMapTemplate(template: any): void {
    const mapId = String(template?.id ?? '').trim();
    if (!mapId) {
      return;
    }
    const ids: string[] = [];
    for (const container of template.containers ?? []) {
      const containerId = String(container?.id ?? '').trim();
      if (!containerId) {
        continue;
      }
      const frozen = deepFreezeTemplate(container);
      this.containerTemplates.set(containerId, frozen);
      ids.push(containerId);
    }
    this.containerIdsByMapId.set(mapId, ids);
  }

  getRef(containerId: string): Readonly<any> {
    const template = this.tryGetRef(containerId);
    if (!template) {
      throw new Error(`未找到容器模板：${containerId}`);
    }
    return template;
  }

  tryGetRef(containerId: string): Readonly<any> | undefined {
    return this.containerTemplates.get(String(containerId ?? '').trim());
  }

  listInMap(mapId: string): readonly any[] {
    return (this.containerIdsByMapId.get(String(mapId ?? '').trim()) ?? [])
      .map((containerId) => this.containerTemplates.get(containerId))
      .filter(Boolean);
  }

  getDropTable(containerId: string): Readonly<any> | null {
    const template = this.tryGetRef(containerId);
    if (!template) {
      return null;
    }
    return {
      drops: template.drops ?? [],
      lootPools: template.lootPools ?? [],
    };
  }

  listIds(): readonly string[] {
    return Array.from(this.containerTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }
}
