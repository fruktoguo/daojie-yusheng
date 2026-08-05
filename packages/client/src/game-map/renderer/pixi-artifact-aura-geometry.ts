/**
 * 飞剑光环使用的方形周长线段。距离允许超出单圈，消费端按周长取模即可。
 */
export interface ArtifactAuraPerimeterSegment {
  from: number;
  to: number;
}

export interface ArtifactAuraGeometry {
  half: number;
  side: number;
  perimeter: number;
  segments: ArtifactAuraPerimeterSegment[];
}

const ARTIFACT_AURA_CORNER_EPSILON = 1e-6;

/**
 * 生成单个相位的虚线几何。每条虚线短于一条方形边，因此最多只需在一个拐角处分段。
 * 这里不能恢复为按取模结果循环推进游标，部分格子尺寸会因浮点误差停在同一拐角。
 */
export function buildArtifactAuraGeometry(
  cellSize: number,
  frameIndex: number,
  frameCount: number,
): ArtifactAuraGeometry {
  const safeCellSize = Number.isFinite(cellSize) ? Math.max(1, cellSize) : 1;
  const safeFrameCount = Number.isFinite(frameCount) ? Math.max(1, Math.trunc(frameCount)) : 1;
  const normalizedFrameIndex = Number.isFinite(frameIndex)
    ? ((Math.trunc(frameIndex) % safeFrameCount) + safeFrameCount) % safeFrameCount
    : 0;
  const half = Math.max(10, safeCellSize * 0.56);
  const side = half * 2;
  const perimeter = side * 4;
  const dashLength = Math.max(6, safeCellSize * 0.18);
  const gapLength = Math.max(4, safeCellSize * 0.12);
  const cycleLength = dashLength + gapLength;
  const phase = normalizedFrameIndex / safeFrameCount * cycleLength;
  const dashCount = Math.max(0, Math.ceil((perimeter + phase) / cycleLength));
  const segments: ArtifactAuraPerimeterSegment[] = [];

  for (let dashIndex = 0; dashIndex < dashCount; dashIndex += 1) {
    const start = dashIndex * cycleLength - phase;
    if (start >= perimeter) {
      break;
    }
    const end = start + dashLength;
    const nextCorner = (Math.floor(start / side) + 1) * side;
    if (
      nextCorner > start + ARTIFACT_AURA_CORNER_EPSILON
      && nextCorner < end - ARTIFACT_AURA_CORNER_EPSILON
    ) {
      segments.push({ from: start, to: nextCorner }, { from: nextCorner, to: end });
      continue;
    }
    segments.push({ from: start, to: end });
  }

  return { half, side, perimeter, segments };
}
