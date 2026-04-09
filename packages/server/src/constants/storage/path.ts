/**
 * 服务端数据目录探测常量。
 */

import * as path from 'path';

const STATIC_SERVER_DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');

/** data 目录候选路径，按优先级排序。 */
export const DATA_DIR_CANDIDATES = [
  process.env.SERVER_DATA_DIR,
  STATIC_SERVER_DATA_DIR,
  path.resolve(process.cwd(), 'data'),
  path.resolve(process.cwd(), 'packages', 'server', 'data'),
].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
