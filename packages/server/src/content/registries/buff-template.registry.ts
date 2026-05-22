/**
 * 本文件属于服务端内容加载或模板 Registry，负责把配置整理成运行期只读引用。
 *
 * 维护时要保持启动期解析、冻结和实例工厂边界，避免 tick 热路径复制大对象。
 */
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import {
  PVP_SHA_BACKLASH_BUFF_ID,
  PVP_SHA_BACKLASH_DECAY_TICKS,
  PVP_SHA_BACKLASH_PERCENT_PER_STACK,
  PVP_SHA_BACKLASH_SOURCE_ID,
  PVP_SHA_INFUSION_ATTACK_CAP_PERCENT,
  PVP_SHA_INFUSION_BUFF_ID,
  PVP_SHA_INFUSION_DECAY_TICKS,
  PVP_SHA_INFUSION_SOURCE_ID,
  PVP_SOUL_INJURY_BUFF_ID,
  PVP_SOUL_INJURY_DURATION_TICKS,
  PVP_SOUL_INJURY_SOURCE_ID,
} from '../../constants/gameplay/pvp';
import { createRuntimeTemporaryBuff } from '../../runtime/player/runtime-buff-instance';
import { resolveProjectPath } from '../../common/project-path';
import { collectJsonFiles, normalizeSharedTechniqueBuffEffect } from '../content-template-utils';
import { deepFreezeTemplate, freezeTemplateMap } from './template-freeze';

const BUFF_INSTANCE_OWN_KEYS = new Set([
  'remainingTicks',
  'duration',
  'stacks',
  'maxStacks',
  'realmLv',
  'sourceRealmLv',
  'infiniteDuration',
  'sustainTicksElapsed',
  'persistOnDeath',
  'persistOnReturnToSpawn',
]);

@Injectable()
export class BuffTemplateRegistry {
  readonly sharedTechniqueBuffs = new Map<string, Record<string, unknown>>();
  readonly buffTemplates = new Map<string, Record<string, unknown>>();
  private readonly pvpSoulInjuryBuffByRealmLv = new Map<number, Record<string, unknown>>();
  private readonly pvpShaInfusionBuffByRealmLv = new Map<number, Record<string, unknown>>();
  private readonly pvpShaBacklashBuffByRealmLv = new Map<number, Record<string, unknown>>();

  loadAll(): void {
    this.sharedTechniqueBuffs.clear();
    this.buffTemplates.clear();
    this.pvpSoulInjuryBuffByRealmLv.clear();
    this.pvpShaInfusionBuffByRealmLv.clear();
    this.pvpShaBacklashBuffByRealmLv.clear();
    this.loadSharedTechniqueBuffs();
  }

  loadSharedTechniqueBuffs(): void {
    const sharedBuffFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'technique-buffs'));
    for (const file of sharedBuffFiles) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Array.isArray(parsed)) {
        continue;
      }
      for (const entry of parsed) {
        const effect = normalizeSharedTechniqueBuffEffect(entry);
        if (!effect) {
          continue;
        }
        const frozen = deepFreezeTemplate(effect);
        this.sharedTechniqueBuffs.set(effect.id, frozen);
        this.buffTemplates.set(effect.id, frozen);
      }
    }
  }

  registerTemplate(template: Record<string, unknown>): void {
    const buffId = typeof template?.buffId === 'string' && template.buffId.trim()
      ? template.buffId.trim()
      : (typeof template?.id === 'string' ? template.id.trim() : '');
    if (!buffId) {
      return;
    }
    this.buffTemplates.set(buffId, deepFreezeTemplate({ ...template, buffId }));
  }

  registerTemplates(templates: Iterable<Record<string, unknown>>): void {
    for (const template of templates) {
      this.registerTemplate(template);
    }
  }

  getRef(buffId: string): Readonly<Record<string, unknown>> {
    const template = this.tryGetRef(buffId);
    if (!template) {
      throw new Error(`未找到 Buff 模板：${buffId}`);
    }
    return template;
  }

  tryGetRef(buffId: string): Readonly<Record<string, unknown>> | undefined {
    return this.buffTemplates.get(String(buffId ?? '').trim());
  }

  createInstance(buffId: string, init: Record<string, unknown> = {}): Record<string, unknown> {
    const template = this.getRef(buffId);
    return this.createInstanceFromTemplate(template, init);
  }

  createInstanceFromTemplate(template: Record<string, unknown>, init: Record<string, unknown> = {}): Record<string, unknown> {
    const buffId = String(template?.buffId ?? template?.id ?? '').trim();
    if (!buffId) {
      throw new Error('Buff 模板缺少 buffId');
    }
    const source: Record<string, unknown> = {};
    for (const key of Object.keys(init ?? {})) {
      if (BUFF_INSTANCE_OWN_KEYS.has(key)) {
        source[key] = init[key];
      }
    }
    return createRuntimeTemporaryBuff({
      ...template,
      ...source,
      buffId,
      remainingTicks: Number.isFinite(source.remainingTicks) ? source.remainingTicks : template.remainingTicks,
      duration: Number.isFinite(source.duration) ? source.duration : template.duration,
      stacks: Number.isFinite(source.stacks) ? source.stacks : template.stacks,
    });
  }

  hydrate(buffId: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
    const normalizedBuffId = String(buffId ?? '').trim();
    if (!normalizedBuffId) {
      return createRuntimeTemporaryBuff(payload);
    }
    const template = this.tryGetRef(normalizedBuffId);
    if (!template) {
      // 没有静态模板（例如旧版 PVP buff、动态参数 buff），回退到 payload 自身重建 prototype。
      return createRuntimeTemporaryBuff({ ...payload, buffId: normalizedBuffId });
    }
    return this.createInstanceFromTemplate(template, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.buffTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  freezeAll(): void {
    freezeTemplateMap(this.sharedTechniqueBuffs);
    freezeTemplateMap(this.buffTemplates);
  }

  createPvPSoulInjuryBuff(sourceRealmLv: number): Record<string, unknown> {
    const template = this.getOrBuildPvpSoulInjuryTemplate(sourceRealmLv);
    return this.createInstanceFromTemplate(template, template);
  }

  createPvPShaInfusionBuff(sourceRealmLv: number): Record<string, unknown> {
    const template = this.getOrBuildPvpShaInfusionTemplate(sourceRealmLv);
    return this.createInstanceFromTemplate(template, template);
  }

  createPvPShaBacklashBuff(sourceRealmLv: number, stacks = 1): Record<string, unknown> {
    const template = this.getOrBuildPvpShaBacklashTemplate(sourceRealmLv);
    return this.createInstanceFromTemplate(template, {
      ...template,
      stacks: Math.max(1, Math.trunc(Number(stacks) || 1)),
    });
  }

  private getOrBuildPvpSoulInjuryTemplate(sourceRealmLv: number): Record<string, unknown> {
    const realmLv = normalizeRealmLevel(sourceRealmLv);
    const cached = this.pvpSoulInjuryBuffByRealmLv.get(realmLv);
    if (cached) {
      return cached;
    }
    const template = deepFreezeTemplate({
      buffId: PVP_SOUL_INJURY_BUFF_ID,
      name: '神魂受损',
      desc: '神魂受创；身死与遁返都不会清除，需静养满一时辰。',
      baseDesc: '神魂受创；身死与遁返都不会清除，需静养满一时辰。',
      shortMark: '残',
      category: 'debuff',
      visibility: 'public',
      remainingTicks: PVP_SOUL_INJURY_DURATION_TICKS,
      duration: PVP_SOUL_INJURY_DURATION_TICKS,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: PVP_SOUL_INJURY_SOURCE_ID,
      sourceSkillName: '杀孽',
      realmLv,
      color: '#8a5a64',
      persistOnDeath: true,
      persistOnReturnToSpawn: true,
    });
    this.pvpSoulInjuryBuffByRealmLv.set(realmLv, template);
    this.buffTemplates.set(`${PVP_SOUL_INJURY_BUFF_ID}:${realmLv}`, template);
    return template;
  }

  private getOrBuildPvpShaInfusionTemplate(sourceRealmLv: number): Record<string, unknown> {
    const realmLv = normalizeRealmLevel(sourceRealmLv);
    const cached = this.pvpShaInfusionBuffByRealmLv.get(realmLv);
    if (cached) {
      return cached;
    }
    const desc = `每层攻击 +1%（最高 +${PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。`;
    const template = deepFreezeTemplate({
      buffId: PVP_SHA_INFUSION_BUFF_ID,
      name: '煞气入体',
      desc,
      baseDesc: desc,
      shortMark: '煞',
      category: 'buff',
      visibility: 'public',
      remainingTicks: PVP_SHA_INFUSION_DECAY_TICKS,
      duration: PVP_SHA_INFUSION_DECAY_TICKS,
      stacks: 1,
      maxStacks: 999999,
      sourceSkillId: PVP_SHA_INFUSION_SOURCE_ID,
      sourceSkillName: '杀孽',
      realmLv,
      color: '#7a2e2e',
      stats: deepFreezeTemplate({
        physAtk: 1,
        spellAtk: 1,
        physDef: -2,
        spellDef: -2,
      }),
      statMode: 'percent',
      persistOnDeath: true,
      persistOnReturnToSpawn: true,
    });
    this.pvpShaInfusionBuffByRealmLv.set(realmLv, template);
    this.buffTemplates.set(`${PVP_SHA_INFUSION_BUFF_ID}:${realmLv}`, template);
    return template;
  }

  private getOrBuildPvpShaBacklashTemplate(sourceRealmLv: number): Record<string, unknown> {
    const realmLv = normalizeRealmLevel(sourceRealmLv);
    const cached = this.pvpShaBacklashBuffByRealmLv.get(realmLv);
    if (cached) {
      return cached;
    }
    const desc = `每层攻击 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%；每十分钟自然消退一层。`;
    const template = deepFreezeTemplate({
      buffId: PVP_SHA_BACKLASH_BUFF_ID,
      name: '煞气反噬',
      desc,
      baseDesc: desc,
      shortMark: '蚀',
      category: 'debuff',
      visibility: 'public',
      remainingTicks: PVP_SHA_BACKLASH_DECAY_TICKS,
      duration: PVP_SHA_BACKLASH_DECAY_TICKS,
      stacks: 1,
      maxStacks: 999999,
      sourceSkillId: PVP_SHA_BACKLASH_SOURCE_ID,
      sourceSkillName: '煞气反噬',
      realmLv,
      color: '#6d2626',
      stats: deepFreezeTemplate({
        physAtk: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
        spellAtk: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
        physDef: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
        spellDef: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
      }),
      statMode: 'percent',
      persistOnDeath: true,
      persistOnReturnToSpawn: true,
    });
    this.pvpShaBacklashBuffByRealmLv.set(realmLv, template);
    this.buffTemplates.set(`${PVP_SHA_BACKLASH_BUFF_ID}:${realmLv}`, template);
    return template;
  }
}

function normalizeRealmLevel(value: number): number {
  return Math.max(1, Math.floor(Number(value) || 1));
}
