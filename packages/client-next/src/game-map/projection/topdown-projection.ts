import type { CameraState } from '../camera/camera-controller';

export class TopdownProjection {
  worldToScreen(
    worldX: number,
    worldY: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
  ): { x: number; y: number } {
    return {
      x: worldX - camera.x + screenWidth / 2 + camera.offsetX,
      y: worldY - camera.y + screenHeight / 2 + camera.offsetY,
    };
  }

  screenToWorld(
    screenX: number,
    screenY: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
  ): { x: number; y: number } {
    return {
      x: screenX - screenWidth / 2 - camera.offsetX + camera.x,
      y: screenY - screenHeight / 2 - camera.offsetY + camera.y,
    };
  }
}
