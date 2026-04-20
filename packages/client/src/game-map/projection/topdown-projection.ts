import type { CameraState } from '../camera/camera-controller';

/** 顶视角坐标转换实现。 */
export class TopdownProjection {
/**
 * worldToScreen：执行核心业务逻辑。
 * @param worldX number 参数说明。
 * @param worldY number 参数说明。
 * @param camera CameraState 参数说明。
 * @param screenWidth number 参数说明。
 * @param screenHeight number 参数说明。
 * @returns { x: number; y: number }。
 */

  worldToScreen(
    worldX: number,
    worldY: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
  ): {  
  /**
 * x：TopdownProjection 内部字段。
 */
 x: number;  
 /**
 * y：TopdownProjection 内部字段。
 */
 y: number } {
    return {
      x: worldX - camera.x + screenWidth / 2 + camera.offsetX,
      y: worldY - camera.y + screenHeight / 2 + camera.offsetY,
    };
  }  
  /**
 * screenToWorld：执行核心业务逻辑。
 * @param screenX number 参数说明。
 * @param screenY number 参数说明。
 * @param camera CameraState 参数说明。
 * @param screenWidth number 参数说明。
 * @param screenHeight number 参数说明。
 * @returns { x: number; y: number }。
 */


  screenToWorld(
    screenX: number,
    screenY: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
  ): {  
  /**
 * x：TopdownProjection 内部字段。
 */
 x: number;  
 /**
 * y：TopdownProjection 内部字段。
 */
 y: number } {
    return {
      x: screenX - screenWidth / 2 - camera.offsetX + camera.x,
      y: screenY - screenHeight / 2 - camera.offsetY + camera.y,
    };
  }
}



