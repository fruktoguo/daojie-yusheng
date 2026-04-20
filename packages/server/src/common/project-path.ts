import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT_CANDIDATES = [
  process.cwd(),
  path.resolve(__dirname, '../../../..'),
];

/** 在当前工作目录与编译产物反推项目根目录，服务端组件通用依赖该路径。 */
function resolveRepoRoot(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
