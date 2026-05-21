import { Injectable } from '@nestjs/common';

import type { SchedulerTaskDefinition } from './scheduler.types';

@Injectable()
export class SchedulerRegistryService {
  private readonly definitions = new Map<string, SchedulerTaskDefinition>();

  register(definition: SchedulerTaskDefinition): SchedulerTaskDefinition {
    const normalized = normalizeDefinition(definition);
    this.definitions.set(normalized.id, normalized);
    return normalized;
  }

  unregister(taskId: string): boolean {
    return this.definitions.delete(normalizeTaskId(taskId));
  }

  get(taskId: string): SchedulerTaskDefinition | null {
    return this.definitions.get(normalizeTaskId(taskId)) ?? null;
  }

  list(): SchedulerTaskDefinition[] {
    return Array.from(this.definitions.values()).map((definition) => ({ ...definition }));
  }

  clear(): void {
    this.definitions.clear();
  }
}

function normalizeDefinition(input: SchedulerTaskDefinition): SchedulerTaskDefinition {
  const id = normalizeTaskId(input.id);
  if (!id) {
    throw new Error('scheduler_task_id_required');
  }
  const intervalMs = normalizeOptionalPositiveInteger(input.intervalMs);
  const timeoutMs = normalizeOptionalPositiveInteger(input.timeoutMs);
  const maxConcurrency = normalizeOptionalPositiveInteger(input.maxConcurrency);
  return {
    ...input,
    id,
    enabled: input.enabled === true,
    intervalMs,
    timeoutMs,
    maxConcurrency,
  };
}

function normalizeTaskId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}
