import {
  listFormationAffectedCells,
  type FormationRangeShape,
  type MapMeta,
  type PlayerState,
} from '@mud/shared';
import type { MapFormationRangeOverlayState } from './game-map/types';

type FormationRangePreviewPayload = {
  shape: FormationRangeShape;
  radius: number;
  rangeHighlightColor?: string;
} | null;

type MainFormationPreviewSourceOptions = {
  getPlayer: () => PlayerState | null;
  getMapMeta: () => MapMeta | null;
  setFormationRangeOverlay: (overlay: MapFormationRangeOverlayState | null) => void;
};

/** 创建阵法世界范围预览源，负责把布阵参数投影为地图格子 overlay。 */
export function createMainFormationPreviewSource(options: MainFormationPreviewSourceOptions) {
  return {
    preview(payload: FormationRangePreviewPayload): void {
      if (!payload) {
        options.setFormationRangeOverlay(null);
        return;
      }
      const player = options.getPlayer();
      const mapMeta = options.getMapMeta();
      if (!player || !mapMeta) {
        options.setFormationRangeOverlay(null);
        return;
      }
      const radius = Math.max(1, Math.trunc(Number(payload.radius) || 1));
      const affectedCells = listFormationAffectedCells(
        payload.shape,
        player.x,
        player.y,
        radius,
        mapMeta.width,
        mapMeta.height,
      );
      options.setFormationRangeOverlay({
        affectedCells,
        rangeHighlightColor: payload.rangeHighlightColor,
      });
    },
  };
}
