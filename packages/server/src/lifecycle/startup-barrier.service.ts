import { Injectable } from '@nestjs/common';

@Injectable()
export class StartupBarrierService {
  private trafficOpen = false;
  private tickOpen = false;
  private flushOpen = false;
  private outboxOpen = false;
  private workerOpen = false;
  private instanceWriteOpen = false;
  private instanceAttachOpen = false;
  private readonly writableInstances = new Set<string>();
  private readonly attachableInstances = new Set<string>();

  resetForStartup(): void {
    this.trafficOpen = false;
    this.tickOpen = false;
    this.flushOpen = false;
    this.outboxOpen = false;
    this.workerOpen = false;
    this.instanceWriteOpen = false;
    this.instanceAttachOpen = false;
    this.writableInstances.clear();
    this.attachableInstances.clear();
  }

  closeForDrain(): void {
    this.closeTraffic();
    this.closeTick();
    this.closeFlush();
    this.closeOutbox();
    this.closeWorker();
    this.closeInstanceWrites();
    this.closeInstanceAttach();
  }

  closeTraffic(): void {
    this.trafficOpen = false;
  }

  closeTick(): void {
    this.tickOpen = false;
  }

  closeFlush(): void {
    this.flushOpen = false;
  }

  closeOutbox(): void {
    this.outboxOpen = false;
  }

  closeWorker(): void {
    this.workerOpen = false;
  }

  closeInstanceWrites(): void {
    this.instanceWriteOpen = false;
    this.writableInstances.clear();
  }

  closeInstanceAttach(): void {
    this.instanceAttachOpen = false;
    this.attachableInstances.clear();
  }

  openTraffic(): void {
    this.trafficOpen = true;
  }

  openTick(): void {
    this.tickOpen = true;
  }

  openFlush(): void {
    this.flushOpen = true;
  }

  openOutbox(): void {
    this.outboxOpen = true;
  }

  openWorker(): void {
    this.workerOpen = true;
  }

  openInstanceWrites(instanceIds: Iterable<string>): void {
    this.instanceWriteOpen = true;
    for (const instanceId of instanceIds) {
      const normalized = normalizeId(instanceId);
      if (normalized) {
        this.writableInstances.add(normalized);
      }
    }
  }

  openInstanceAttach(instanceIds: Iterable<string>): void {
    this.instanceAttachOpen = true;
    for (const instanceId of instanceIds) {
      const normalized = normalizeId(instanceId);
      if (normalized) {
        this.attachableInstances.add(normalized);
      }
    }
  }

  isTrafficOpen(): boolean {
    return this.trafficOpen;
  }

  isTickOpen(): boolean {
    return this.tickOpen;
  }

  isFlushOpen(): boolean {
    return this.flushOpen;
  }

  isOutboxOpen(): boolean {
    return this.outboxOpen;
  }

  isWorkerOpen(): boolean {
    return this.workerOpen;
  }

  isInstanceWritable(instanceId: string): boolean {
    const normalized = normalizeId(instanceId);
    return this.instanceWriteOpen && (!normalized || this.writableInstances.size === 0 || this.writableInstances.has(normalized));
  }

  isInstanceAttachAllowed(instanceId: string): boolean {
    const normalized = normalizeId(instanceId);
    return this.instanceAttachOpen && (!normalized || this.attachableInstances.size === 0 || this.attachableInstances.has(normalized));
  }

  getSnapshot() {
    return {
      trafficOpen: this.trafficOpen,
      tickOpen: this.tickOpen,
      flushOpen: this.flushOpen,
      outboxOpen: this.outboxOpen,
      workerOpen: this.workerOpen,
      instanceWriteOpen: this.instanceWriteOpen,
      instanceAttachOpen: this.instanceAttachOpen,
      writableInstanceCount: this.writableInstances.size,
      attachableInstanceCount: this.attachableInstances.size,
    };
  }
}

function normalizeId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
