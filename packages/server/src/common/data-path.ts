import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'data'),
  path.resolve(process.cwd(), 'packages', 'server', 'data'),
];

export function resolveServerDataPath(...segments: string[]): string {
  const baseDir = DATA_DIR_CANDIDATES.find((candidate) => fs.existsSync(candidate))
    ?? DATA_DIR_CANDIDATES[0]!;
  return path.join(baseDir, ...segments);
}
