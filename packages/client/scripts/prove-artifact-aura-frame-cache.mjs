/**
 * ISSUE-000004：法宝开启后的 Pixi 动画不得在每个渲染帧重建矢量几何。
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = 'REPAIR_PROOF:ISSUE-000004:PASS';
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererPath = path.join(clientRoot, 'src/game-map/renderer/pixi-map-renderer-adapter.ts');
const statePath = path.join(clientRoot, 'src/game-map/renderer/pixi-render-state.ts');

function extractMethod(source, name) {
  const start = source.indexOf(`  private ${name}(`);
  assert(start >= 0, `缺少 ${name} 方法`);
  const next = source.indexOf('\n  private ', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

const [rendererSource, stateSource] = await Promise.all([
  readFile(rendererPath, 'utf8'),
  readFile(statePath, 'utf8'),
]);

assert.match(rendererSource, /const ARTIFACT_AURA_FRAME_COUNT = 16;/, '法宝光环必须使用有界相位帧');
assert.match(stateSource, /artifactAura: Container;/, '法宝光环必须使用相位帧容器');
assert.match(stateSource, /artifactAuraFrames: Graphics\[\];/, '实体视图必须缓存法宝光环帧');

const syncMethod = extractMethod(rendererSource, 'syncArtifactAura');
assert.match(syncMethod, /view\.artifactAuraCellSize !== cellSize/, '缩放变化时必须重建对应尺寸的相位帧');
assert.match(syncMethod, /this\.createArtifactAuraFrame\(cellSize, frameIndex\)/, '启用时必须一次创建相位帧');

const frameUpdateMethod = extractMethod(rendererSource, 'updateArtifactAuraFrame');
assert.match(frameUpdateMethod, /previousFrame\.visible = false;/, '动画帧必须关闭旧相位');
assert.match(frameUpdateMethod, /nextFrame\.visible = true;/, '动画帧必须启用新相位');
assert.doesNotMatch(frameUpdateMethod, /\.clear\(|\.moveTo\(|\.lineTo\(|new Graphics/, '动画热路径不得重建 Pixi 几何');

const motionMethod = extractMethod(rendererSource, 'patchEntityMotion');
assert.match(motionMethod, /this\.updateArtifactAuraFrame\(view, now\);/, '实体动画必须只切换缓存相位');
assert.doesNotMatch(motionMethod, /drawArtifactAura|createArtifactAuraFrame/, '实体动画不得直接绘制法宝路径');

const destroyMethod = extractMethod(rendererSource, 'destroyEntityView');
assert.match(destroyMethod, /view\.artifactAura\.removeChildren\(\)/, '实体释放前必须移除全部法宝相位帧');
assert.match(destroyMethod, /frame\.destroy\(\{ context: true \}\)/, '法宝相位帧必须显式释放 Pixi context');
assert.match(rendererSource, /for \(const view of this\.entities\.values\(\)\) this\.destroyEntityView\(view\);/, '场景重置必须走统一实体释放入口');

console.log(MARKER);
