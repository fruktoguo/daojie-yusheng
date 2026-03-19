import { PlayerState } from '@mud/shared';

interface HUDMeta {
  mapName?: string;
  mapDanger?: string;
  realmLabel?: string;
  realmProgressLabel?: string;
  objectiveLabel?: string;
  threatLabel?: string;
  titleLabel?: string;
}

export class HUD {
  private nameDiv = document.getElementById('hud-name')!;
  private titleDiv = document.getElementById('hud-title')!;
  private posDiv = document.getElementById('hud-pos')!;
  private mapDiv = document.getElementById('hud-map')!;
  private objectiveDiv = document.getElementById('hud-objective')!;
  private threatDiv = document.getElementById('hud-threat')!;
  private realmValue = document.getElementById('hud-realm')!;
  private realmSub = document.getElementById('hud-realm-sub')!;
  private hpText = document.getElementById('hud-hp-text')!;
  private hpBar = document.getElementById('hud-hp-bar')!;
  private qiText = document.getElementById('hud-qi-text')!;
  private qiBar = document.getElementById('hud-qi-bar')!;
  private cultivateBar = document.getElementById('hud-cultivate-bar')!;
  private cultivateText = document.getElementById('hud-cultivate')!;

  update(player: PlayerState, meta?: HUDMeta) {
    this.nameDiv.textContent = player.name;
    this.titleDiv.textContent = meta?.titleLabel ?? '无号散修';
    this.posDiv.textContent = `(${player.x}, ${player.y})`;
    this.mapDiv.textContent = meta?.mapDanger ? `${meta.mapName ?? player.mapId} · ${meta.mapDanger}` : (meta?.mapName ?? player.mapId);
    this.objectiveDiv.textContent = meta?.objectiveLabel ?? '暂无';
    this.threatDiv.textContent = meta?.threatLabel ?? '平稳';

    const realmLabel = meta?.realmLabel ?? player.realmName ?? player.realmStage ?? '-';
    this.realmValue.textContent = realmLabel;
    const progressLabel = player.realm
      ? player.realm.breakthroughReady
        ? '突破已就绪'
        : `修为 ${player.realm.progress}/${player.realm.progressToNext}`
      : meta?.realmProgressLabel ?? '-';
    this.realmSub.textContent = progressLabel;

    this.setResource(this.hpBar, this.hpText, player.hp, player.maxHp);
    const qiMax = Math.max(0, Math.round(player.numericStats?.maxQi ?? 0));
    const qiCurrent = Math.max(0, Math.round(player.qi));
    this.setResource(this.qiBar, this.qiText, qiCurrent, qiMax);

    if (player.realm && player.realm.progressToNext > 0) {
      const ratio = Math.min(1, player.realm.progress / player.realm.progressToNext);
      this.cultivateBar.style.width = `${Math.round(ratio * 100)}%`;
      this.cultivateText.textContent = `修为 ${player.realm.progress}/${player.realm.progressToNext}`;
    } else {
      this.cultivateBar.style.width = '0%';
      this.cultivateText.textContent = '-';
    }
  }

  private setResource(bar: HTMLElement, text: HTMLElement, value: number, max: number) {
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    bar.style.width = `${Math.round(ratio * 100)}%`;
    text.textContent = `${Math.max(0, Math.round(value))}/${Math.max(0, Math.round(max))}`;
  }
}
