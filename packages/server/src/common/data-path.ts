/**
 * 服务端数据目录路径解析 —— 自动探测 data 目录位置
 */
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR_CANDIDATES } from '../constants/storage/path';

/** 拼接服务端 data 目录下的子路径，自动选择存在的候选目录 */
export function resolveServerDataPath(...segments: string[]): string {
/** baseDir：定义该变量以承载业务值。 */
  const baseDir = DATA_DIR_CANDIDATES.find((candidate) => fs.existsSync(candidate))
    ?? DATA_DIR_CANDIDATES[0]!;
  return path.join(baseDir, ...segments);
}
