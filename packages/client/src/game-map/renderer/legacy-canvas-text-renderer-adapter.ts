import { getDisplayRangeX, getDisplayRangeY } from '../../display';
import { Camera } from '../../renderer/camera';
import { TextRenderer } from '../../renderer/text';
import type { CombatEffect } from '@mud/shared';
import type { CameraState } from '../camera/camera-controller';
import type { TopdownProjection } from '../projection/topdown-projection';
import type { MapEntityTransition, MapSceneSnapshot } from '../types';

export class LegacyCanvasTextRendererAdapter {
  private readonly renderer = new TextRenderer();
  private readonly cameraBridge = new Camera();
  private canvas: HTMLCanvasElement | null = null;

  mount(host: HTMLElement): void {
    const canvas = host.querySelector<HTMLCanvasElement>('#game-canvas') ?? host.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) {
      throw new Error('地图宿主节点缺少 canvas');
    }
    this.canvas = canvas;
    this.renderer.init(canvas);
  }

  unmount(): void {
    this.canvas = null;
  }

  destroy(): void {
    this.renderer.destroy();
    this.canvas = null;
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.style.width = `${Math.max(1, width)}px`;
    this.canvas.style.height = `${Math.max(1, height)}px`;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
  }

  syncScene(scene: MapSceneSnapshot, transition: MapEntityTransition | null): void {
    this.renderer.setPathHighlight(scene.overlays.pathCells);
    this.renderer.setTargetingOverlay(scene.overlays.targeting);
    this.renderer.setSenseQiOverlay(scene.overlays.senseQi);
    this.renderer.updateEntities(
      scene.entities.map((entity) => ({
        ...entity,
        npcQuestMarker: entity.npcQuestMarker ?? undefined,
      })),
      transition?.movedId,
      transition?.shiftX,
      transition?.shiftY,
      transition?.settleMotion === true,
    );
  }

  enqueueEffect(effect: CombatEffect): void {
    if (effect.type === 'attack') {
      this.renderer.addAttackTrail(effect.fromX, effect.fromY, effect.toX, effect.toY, effect.color);
      return;
    }
    this.renderer.addFloatingText(effect.x, effect.y, effect.text, effect.color, effect.variant);
  }

  resetScene(): void {
    this.renderer.resetScene();
    this.renderer.setPathHighlight([]);
    this.renderer.setTargetingOverlay(null);
    this.renderer.setSenseQiOverlay(null);
  }

  render(
    scene: MapSceneSnapshot,
    camera: CameraState,
    projection: TopdownProjection,
    progress: number,
  ): void {
    if (!this.canvas) {
      return;
    }

    this.cameraBridge.x = camera.x;
    this.cameraBridge.y = camera.y;
    this.cameraBridge.worldToScreen = (wx, wy, screenW, screenH) => {
        const point = projection.worldToScreen(wx, wy, camera, screenW, screenH);
        return {
          sx: point.x,
          sy: point.y,
        };
      };

    this.renderer.clear();
    if (!scene.player) {
      return;
    }
    this.renderer.renderWorld(
      this.cameraBridge,
      new Map(scene.terrain.tileCache),
      new Set(scene.terrain.visibleTiles),
      scene.player.x,
      scene.player.y,
      getDisplayRangeX(),
      getDisplayRangeY(),
      scene.terrain.time,
    );
    this.renderer.renderAttackTrails(this.cameraBridge);
    this.renderer.renderEntities(this.cameraBridge, progress);
    this.renderer.renderFloatingTexts(this.cameraBridge);
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }
}
