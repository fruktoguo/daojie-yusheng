/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界网关内容模板查询 helper。
 * 处理客户端按需查询动态内容模板的请求，从各 Registry 批量查询并返回。
 */

import { Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';
import type { C2S_RequestContentTemplates, S2C_ContentTemplates } from '@mud/shared';
import type { Socket } from 'socket.io';
import { ItemTemplateRegistry } from '../content/registries/item-template.registry';
import { TechniqueTemplateRegistry } from '../content/registries/technique-template.registry';
import { SkillTemplateRegistry } from '../content/registries/skill-template.registry';
import { BuffTemplateRegistry } from '../content/registries/buff-template.registry';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';

/** 单域每次请求最大 ID 数量。 */
const MAX_IDS_PER_DOMAIN = 50;

@Injectable()
export class WorldGatewayContentHelper {
  constructor(
    private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
    private readonly itemRegistry: ItemTemplateRegistry,
    private readonly techniqueRegistry: TechniqueTemplateRegistry,
    private readonly skillRegistry: SkillTemplateRegistry,
    private readonly buffRegistry: BuffTemplateRegistry,
  ) {}

  /** 处理 C2S.RequestContentTemplates 请求。 */
  handleRequestContentTemplates(client: Socket, payload: C2S_RequestContentTemplates): void {
    const playerId = this.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }

    const response: S2C_ContentTemplates = {};

    // 物品模板查询
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      const ids = payload.items.slice(0, MAX_IDS_PER_DOMAIN);
      const items: S2C_ContentTemplates['items'] = [];
      for (const id of ids) {
        const template = this.itemRegistry.tryGetRef(id);
        if (template) {
          items.push(this.projectItemTemplate(template) as unknown as NonNullable<S2C_ContentTemplates['items']>[number]);
        }
      }
      if (items.length > 0) {
        response.items = items;
      }
    }

    // 功法模板查询
    if (Array.isArray(payload.techniques) && payload.techniques.length > 0) {
      const ids = payload.techniques.slice(0, MAX_IDS_PER_DOMAIN);
      const techniques: S2C_ContentTemplates['techniques'] = [];
      for (const id of ids) {
        const template = this.techniqueRegistry.tryGetRef(id);
        if (template) {
          techniques.push(this.projectTechniqueTemplate(template) as unknown as NonNullable<S2C_ContentTemplates['techniques']>[number]);
        }
      }
      if (techniques.length > 0) {
        response.techniques = techniques;
      }
    }

    // 技能模板查询
    if (Array.isArray(payload.skills) && payload.skills.length > 0) {
      const ids = payload.skills.slice(0, MAX_IDS_PER_DOMAIN);
      const skills: S2C_ContentTemplates['skills'] = [];
      for (const id of ids) {
        const template = this.skillRegistry.tryGetRef(id);
        if (template) {
          skills.push(template as unknown as NonNullable<S2C_ContentTemplates['skills']>[number]);
        }
      }
      if (skills.length > 0) {
        response.skills = skills;
      }
    }

    // Buff 模板查询
    if (Array.isArray(payload.buffs) && payload.buffs.length > 0) {
      const ids = payload.buffs.slice(0, MAX_IDS_PER_DOMAIN);
      const buffs: S2C_ContentTemplates['buffs'] = [];
      for (const id of ids) {
        const template = this.buffRegistry.tryGetRef(id);
        if (template) {
          buffs.push(template as unknown as NonNullable<S2C_ContentTemplates['buffs']>[number]);
        }
      }
      if (buffs.length > 0) {
        response.buffs = buffs;
      }
    }

    // 任务模板暂不支持（QuestTemplateRegistry 尚未独立，后续扩展）

    client.emit(S2C.ContentTemplates, response);
  }

  /** 投影物品模板为客户端安全视图（去除服务端内部字段）。 */
  private projectItemTemplate(template: Readonly<Record<string, unknown>>): Record<string, unknown> {
    // 返回客户端需要的展示字段，排除服务端内部字段
    const {
      // 排除服务端内部字段
      _internal,
      dropWeight,
      spawnWeight,
      ...clientSafe
    } = template as Record<string, unknown>;
    void _internal;
    void dropWeight;
    void spawnWeight;
    return clientSafe;
  }

  /** 投影功法模板为客户端安全视图。 */
  private projectTechniqueTemplate(template: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const {
      _internal,
      ...clientSafe
    } = template as Record<string, unknown>;
    void _internal;
    return clientSafe;
  }
}
