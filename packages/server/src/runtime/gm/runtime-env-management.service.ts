/**
 * GM 环境变量管理服务：
 * - 读取当前 process.env 与 `.runtime/server.local.env`
 * - 允许对注册表内变量做 runtime override / 持久化
 * - 永远隐藏 GM 密码，不允许查看或修改
 */
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import type {
  GmEnvironmentVarItem,
  GmEnvironmentVarListRes,
  GmEnvironmentVarSource,
  GmReloadEnvironmentVarsRes,
} from '@mud/shared';
import {
  deleteRuntimeEnvFileEntry,
  readRuntimeEnvFile,
  upsertRuntimeEnvFileEntry,
} from '../../config/runtime-env-file';
import { getInitialRuntimeEnvSnapshot } from '../../config/load-local-runtime-env';
import {
  getRuntimeEnvCategoryOrder,
  getRuntimeEnvDescriptor,
  isHiddenRuntimeEnvKey,
  isSensitiveRuntimeEnvKey,
  listManagedRuntimeEnvKeys,
} from './runtime-env-registry';

@Injectable()
export class RuntimeEnvManagementService implements OnModuleInit {
  private readonly logger = new Logger(RuntimeEnvManagementService.name);
  private readonly initialEnvSnapshot = new Map(getInitialRuntimeEnvSnapshot());
  private runtimeOverrides = new Map<string, string>();
  private persistedEnv = new Map<string, string>();

  async onModuleInit(): Promise<void> {
    this.reloadFromDisk();
  }

  list(): GmEnvironmentVarListRes {
    const items = listManagedRuntimeEnvKeys()
      .filter((key) => key && !isHiddenRuntimeEnvKey(key))
      .map((key) => this.buildItem(key))
      .sort((left, right) => {
        const leftOrder = getRuntimeEnvCategoryOrder(left.category);
        const rightOrder = getRuntimeEnvCategoryOrder(right.category);
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.label.localeCompare(right.label, 'zh-Hans-CN');
      });

    return { items, checkedAt: Date.now() };
  }

  set(key: string, value: string, persist = false): GmEnvironmentVarItem {
    const normalizedKey = this.assertEditableKey(key);
    const normalizedValue = this.normalizeValue(value);
    const descriptor = getRuntimeEnvDescriptor(normalizedKey);
    if (persist && descriptor?.persistable === false) {
      throw new BadRequestException('该环境变量不支持持久化');
    }
    if (persist) {
      this.persistedEnv = upsertRuntimeEnvFileEntry(normalizedKey, normalizedValue);
      this.runtimeOverrides.delete(normalizedKey);
    } else {
      this.runtimeOverrides.set(normalizedKey, normalizedValue);
    }
    process.env[normalizedKey] = normalizedValue;
    return this.buildItem(normalizedKey);
  }

  delete(key: string): GmEnvironmentVarItem {
    const normalizedKey = this.assertEditableKey(key);
    this.runtimeOverrides.delete(normalizedKey);
    this.persistedEnv = deleteRuntimeEnvFileEntry(normalizedKey);
    this.restoreOriginalValue(normalizedKey);
    return this.buildItem(normalizedKey);
  }

  reload(): GmReloadEnvironmentVarsRes {
    const previousManagedKeys = new Set<string>([
      ...this.runtimeOverrides.keys(),
      ...this.persistedEnv.keys(),
    ]);
    const nextPersistedEnv = readRuntimeEnvFile();

    for (const key of previousManagedKeys) {
      if (isHiddenRuntimeEnvKey(key)) continue;
      if (nextPersistedEnv.has(key)) continue;
      this.restoreOriginalValue(key);
    }

    for (const [key, value] of nextPersistedEnv) {
      if (isHiddenRuntimeEnvKey(key)) continue;
      process.env[key] = value;
    }

    this.persistedEnv = nextPersistedEnv;
    this.runtimeOverrides.clear();

    this.logger.log(`运行时环境变量已重载，共 ${this.persistedEnv.size} 个持久化项`);
    return { ok: true, reloadedAt: Date.now(), count: this.persistedEnv.size };
  }

  private reloadFromDisk(): void {
    this.persistedEnv = readRuntimeEnvFile();
    for (const [key, value] of this.persistedEnv) {
      if (isHiddenRuntimeEnvKey(key)) continue;
      process.env[key] = value;
    }
  }

  private buildItem(key: string): GmEnvironmentVarItem {
    const descriptor = getRuntimeEnvDescriptor(key);
    const currentValue = this.getCurrentValue(key);
    const source = this.getSource(key);
    const managed = descriptor !== null;
    const sensitive = descriptor?.sensitive === true || isSensitiveRuntimeEnvKey(key);
    const editable = descriptor?.editable !== false && !isHiddenRuntimeEnvKey(key);
    const persistable = descriptor?.persistable !== false && editable;
    const restartRequired = descriptor?.restartRequired ?? true;

    return {
      key,
      label: descriptor?.label ?? key,
      description: descriptor?.description ?? (managed ? '' : '未注册项，仅展示当前进程可见值。'),
      category: descriptor?.category ?? '其他',
      value: sensitive ? maskSensitiveValue(currentValue) : currentValue,
      source,
      editable,
      persistable,
      restartRequired,
      sensitive,
      managed,
      persistent: this.persistedEnv.has(key),
    };
  }

  private getCurrentValue(key: string): string {
    if (this.runtimeOverrides.has(key)) return this.runtimeOverrides.get(key) ?? '';
    if (typeof process.env[key] === 'string') return process.env[key] ?? '';
    if (this.persistedEnv.has(key)) return this.persistedEnv.get(key) ?? '';
    return '';
  }

  private getSource(key: string): GmEnvironmentVarSource {
    if (this.runtimeOverrides.has(key)) return 'runtime_override';
    if (this.persistedEnv.has(key)) return 'runtime_file';
    if (typeof process.env[key] === 'string' && process.env[key]!.trim() !== '') return 'process_env';
    return 'unset';
  }

  private assertEditableKey(key: string): string {
    const normalizedKey = typeof key === 'string' ? key.trim() : '';
    if (!normalizedKey) {
      throw new BadRequestException('环境变量 key 不能为空');
    }
    if (isHiddenRuntimeEnvKey(normalizedKey)) {
      throw new BadRequestException('该环境变量不可通过 GM 界面查看或修改');
    }
    const descriptor = getRuntimeEnvDescriptor(normalizedKey);
    if (!descriptor) {
      throw new BadRequestException('该环境变量未注册为可管理项');
    }
    if (descriptor.editable === false) {
      throw new BadRequestException('该环境变量为只读，不能修改');
    }
    return normalizedKey;
  }

  private normalizeValue(value: string): string {
    const normalized = typeof value === 'string' ? value : '';
    if (normalized.trim().length === 0) {
      throw new BadRequestException('环境变量值不能为空');
    }
    if (normalized.includes('\n') || normalized.includes('\r')) {
      throw new BadRequestException('环境变量值不能包含换行');
    }
    return normalized;
  }

  private restoreOriginalValue(key: string): void {
    const original = this.initialEnvSnapshot.get(key);
    if (typeof original === 'string') {
      process.env[key] = original;
      return;
    }
    delete process.env[key];
  }
}

function maskSensitiveValue(value: string): string {
  if (!value) return '（未设置）';
  return `****（长度 ${value.length}）`;
}
