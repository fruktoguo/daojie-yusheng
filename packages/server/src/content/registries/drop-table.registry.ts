import { Injectable } from '@nestjs/common';

@Injectable()
export class DropTableRegistry {
  readonly monsterDropsByMonsterId = new Map<string, any[]>();

  loadAll(): void {
    this.monsterDropsByMonsterId.clear();
  }

  getRef(monsterId: string): readonly any[] {
    const table = this.tryGetRef(monsterId);
    if (!table) {
      throw new Error(`未找到妖兽掉落表：${monsterId}`);
    }
    return table;
  }

  tryGetRef(monsterId: string): readonly any[] | undefined {
    return this.monsterDropsByMonsterId.get(String(monsterId ?? '').trim());
  }

  createInstance(monsterId: string, init: any = {}): any {
    return { ...init, monsterId };
  }

  hydrate(monsterId: string, payload: any = {}): any {
    return this.createInstance(monsterId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.monsterDropsByMonsterId.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }
}
