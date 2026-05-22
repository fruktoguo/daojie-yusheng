/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * 项目路径解析工具：自动探测仓库根目录（支持 SERVER_PACKAGE_ROOT 覆盖、
 * cwd 和编译产物反推），提供 resolveProjectPath 供服务端各组件统一引用资源。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const packageRootOverride = typeof process.env.SERVER_PACKAGE_ROOT === 'string'
  ? process.env.SERVER_PACKAGE_ROOT.trim()
  : '';

const REPO_ROOT_CANDIDATES = [
  packageRootOverride ? path.resolve(packageRootOverride, '..', '..') : '',
  process.cwd(),
  path.resolve(__dirname, '../../../..'),
].filter((entry) => Boolean(entry));

/** 在当前工作目录与编译产物反推项目根目录，服务端组件通用依赖该路径。 */
function resolveRepoRoot(): string {
  for (const candidate of REPO_ROOT_CANDIDATES) {
    if (fs.existsSync(path.join(candidate, 'packages'))) {
      return candidate;
    }
  }
  return REPO_ROOT_CANDIDATES[0];
}

/** 拼接仓库级资源路径，统一通过仓库根目录计算运行时路径。 */
export function resolveProjectPath(...segments: string[]): string {
  const repoRoot = resolveRepoRoot();
  return path.join(repoRoot, ...segments);
}
