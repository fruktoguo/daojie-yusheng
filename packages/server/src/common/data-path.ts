/**
 * 服务端数据目录路径解析 —— 自动探测 data 目录位置
 */
import * as fs from 'fs';
import * as path from 'path';

/** data 目录候选路径，按优先级排列 */
const DATA_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'data'),
  path.resolve(process.cwd(), 'packages', 'server', 'data'),
];

/** 拼接服务端 data 目录下的子路径，自动选择存在的候选目录 */
export function resolveServerDataPath(...segments: string[]): string {
  const baseDir = DATA_DIR_CANDIDATES.find((candidate) => fs.existsSync(candidate))
    ?? DATA_DIR_CANDIDATES[0]!;
  return path.join(baseDir, ...segments);
}
