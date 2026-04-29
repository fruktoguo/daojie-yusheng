import type { CameraState } from '../camera/camera-controller';

/** 顶视角坐标转换实现。 */
export class TopdownProjection {
/**
 * worldToScreen：执行世界ToScreen相关逻辑。
 * @param worldX number 参数说明。
 * @param worldY number 参数说明。
 * @param camera CameraState 参数说明。
 * @param screenWidth number 参数说明。
 * @param screenHeight number 参数说明。
 * @returns 返回世界ToScreen。
 */

  worldToScreen(
    worldX: number,
    worldY: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
  ): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } {
    return {
      x: worldX - camera.x + screenWidth / 2 + camera.offsetX,
      y: worldY - camera.y + screenHeight / 2 + camera.offsetY,
    };
  }  
  /**
 * screenToWorld：执行screenTo世界相关逻辑。
 * @param screenX number 参数说明。
 * @param screenY number 参数说明。
 * @param camera CameraState 参数说明。
 * @param screenWidth number 参数说明。
 * @param screenHeight number 参数说明。
 * @returns 返回screenTo世界。
 */


  screenToWorld(
    screenX: number,
    screenY: number,
    camera: CameraState,
    screenWidth: number,
    screenHeight: number,
  ): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } {
    return {
      x: screenX - screenWidth / 2 - camera.offsetX + camera.x,
      y: screenY - screenHeight / 2 - camera.offsetY + camera.y,
    };
  }
}



