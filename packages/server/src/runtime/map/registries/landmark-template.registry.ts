/**
 * 本文件实现服务端内容模板 Registry，负责把启动期解析后的配置变成运行期只读引用。
 *
 * 维护时要保持模板冻结和实例工厂边界，避免 tick 热路径复制大对象或手写模板字段。
 */
import { Injectable } from '@nestjs/common';
import { deepFreezeTemplate } from '../../../content/registries/template-freeze';

@Injectable()
export class LandmarkTemplateRegistry {
  readonly landmarkTemplates = new Map<string, any>();
  private readonly landmarkIdsByMapId = new Map<string, string[]>();

  loadAll(): void {
    this.landmarkTemplates.clear();
    this.landmarkIdsByMapId.clear();
  }

  registerMapTemplate(template: any): void {
    const mapId = String(template?.id ?? '').trim();
    if (!mapId) {
      return;
    }
    const ids: string[] = [];
    for (const landmark of template.landmarks ?? []) {
      const landmarkId = String(landmark?.id ?? '').trim();
      if (!landmarkId) {
        continue;
      }
      const frozen = deepFreezeTemplate(landmark);
      this.landmarkTemplates.set(landmarkId, frozen);
      ids.push(landmarkId);
    }
    this.landmarkIdsByMapId.set(mapId, ids);
  }

  getRef(landmarkId: string): Readonly<any> {
    const template = this.tryGetRef(landmarkId);
    if (!template) {
      throw new Error(`未找到地标模板：${landmarkId}`);
    }
    return template;
  }

  tryGetRef(landmarkId: string): Readonly<any> | undefined {
    return this.landmarkTemplates.get(String(landmarkId ?? '').trim());
  }

  listInMap(mapId: string): readonly any[] {
    return (this.landmarkIdsByMapId.get(String(mapId ?? '').trim()) ?? [])
      .map((landmarkId) => this.landmarkTemplates.get(landmarkId))
      .filter(Boolean);
  }

  listIds(): readonly string[] {
    return Array.from(this.landmarkTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }
}
