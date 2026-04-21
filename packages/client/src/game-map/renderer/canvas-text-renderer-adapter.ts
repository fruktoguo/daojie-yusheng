import { getDisplayRangeX, getDisplayRangeY } from '../../display';
import { Camera } from '../../renderer/camera';
import { TextRenderer } from '../../renderer/text';
import { isLocalDivineSkillName } from '../../content/local-templates';
import type { CombatEffect } from '@mud/shared-next';
import type { CameraState } from '../camera/camera-controller';
import type { TopdownProjection } from '../projection/topdown-projection';
import type { MapEntityTransition, MapSceneSnapshot } from '../types';
import type { FloatingActionTextStyle } from '../../renderer/types';

/** Canvas 渲染适配器，连接地图场景数据与文本渲染器实现。 */
export class CanvasTextRendererAdapter {
  /** 文本渲染器实例。 */
  private readonly renderer = new TextRenderer();
  /** 适配 camera 状态到通用 camera 接口的桥接对象。 */
  private readonly cameraBridge = new Camera();
  /** 当前挂载画布。 */
  private canvas: HTMLCanvasElement | null = null;

  /** 绑定宿主并初始化画布渲染器。 */
  mount(host: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const canvas = host.querySelector<HTMLCanvasElement>('#game-canvas') ?? host.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) {
      throw new Error('地图宿主节点缺少 canvas');
    }
    this.canvas = canvas;
    this.renderer.init(canvas);
  }

  /** 清理挂载引用，不销毁底层渲染器。 */
  unmount(): void {
    this.canvas = null;
  }

  /** 销毁渲染器并清空画布引用。 */
  destroy(): void {
    this.renderer.destroy();
    this.canvas = null;
  }

  /** 同步样式尺寸与实际像素尺寸。 */
  resize(width: number, height: number, backbufferWidth: number, backbufferHeight: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.canvas) {
      return;
    }
    this.canvas.style.width = `${Math.max(1, width)}px`;
    this.canvas.style.height = `${Math.max(1, height)}px`;
    this.canvas.width = Math.max(1, Math.floor(backbufferWidth));
    this.canvas.height = Math.max(1, Math.floor(backbufferHeight));
  }  
  /**
 * syncScene：处理Scene并更新相关状态。
 * @param scene MapSceneSnapshot 参数说明。
 * @param transition MapEntityTransition | null 参数说明。
 * @param motionSyncToken number 参数说明。
 * @param pathFadeDurationMs number 参数说明。
 * @returns 无返回值，直接更新Scene相关状态。
 */


  syncScene(
    scene: MapSceneSnapshot,
    transition: MapEntityTransition | null,
    motionSyncToken?: number,
    pathFadeDurationMs?: number,
  ): void {
    this.renderer.setPathHighlight(scene.overlays.pathCells, pathFadeDurationMs);
    this.renderer.setThreatArrows(scene.overlays.threatArrows);
    this.renderer.setTargetingOverlay(scene.overlays.targeting);
    this.renderer.setSenseQiOverlay(scene.overlays.senseQi);
    this.renderer.setGroundPiles(scene.groundPiles);
    const settleEntityId = transition?.settleMotion === true ? scene.player?.id : undefined;
    this.renderer.updateEntities(
      scene.entities,
      transition?.movedId,
      transition?.shiftX,
      transition?.shiftY,
      transition?.settleMotion === true,
      settleEntityId,
      motionSyncToken,
    );
  }

  /** 将服务端特效映射为具体渲染器调用。 */
  enqueueEffect(effect: CombatEffect): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (effect.type === 'attack') {
      this.renderer.addAttackTrail(effect.fromX, effect.fromY, effect.toX, effect.toY, effect.color);
      return;
    }
    if (effect.type === 'warning_zone') {
      this.renderer.addWarningZone(
        effect.cells,
        effect.color,
        effect.durationMs,
        effect.baseColor,
        effect.originX,
        effect.originY,
      );
      return;
    }
    this.renderer.addFloatingText(
      effect.x,
      effect.y,
      effect.text,
      effect.color,
      effect.variant,
      this.resolveActionTextStyle(effect),
      effect.durationMs,
    );
  }

  /** 重置渲染态并清空场景级叠加。 */
  resetScene(): void {
    this.renderer.resetScene();
    this.renderer.setPathHighlight([]);
    this.renderer.setTargetingOverlay(null);
    this.renderer.setSenseQiOverlay(null);
  }  
  /**
 * render：执行render相关逻辑。
 * @param scene MapSceneSnapshot 参数说明。
 * @param camera CameraState 参数说明。
 * @param projection TopdownProjection 参数说明。
 * @param progress number 参数说明。
 * @returns 无返回值，直接更新结果相关状态。
 */


  render(
    scene: MapSceneSnapshot,
    camera: CameraState,
    projection: TopdownProjection,
    progress: number,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      scene.terrain.tileCache,
      scene.terrain.visibleTiles,
      scene.terrain.visibleTileRevision,
      scene.player.x,
      scene.player.y,
      getDisplayRangeX(),
      getDisplayRangeY(),
      scene.terrain.time,
    );
    this.renderer.renderWarningZones(this.cameraBridge);
    this.renderer.renderAttackTrails(this.cameraBridge);
    this.renderer.renderEntities(this.cameraBridge, progress, scene.player.id, scene.player.x, scene.player.y, scene.player.char);
    this.renderer.renderFloatingTexts(this.cameraBridge);
  }

  /** 获取当前绑定的画布。 */
  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /** 从动作特效推断浮动文字样式。 */
  private resolveActionTextStyle(effect: Extract<CombatEffect, {  
  /**
 * type：type相关字段。
 */
 type: 'float' }>): FloatingActionTextStyle | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (effect.variant !== 'action') {
      return undefined;
    }
    if (effect.actionStyle) {
      return effect.actionStyle;
    }
    return isLocalDivineSkillName(effect.text) ? 'divine' : 'default';
  }
}


