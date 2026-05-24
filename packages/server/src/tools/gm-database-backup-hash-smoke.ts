/**
 * 用途：验证 GM 数据库备份 SHA-256 计算使用文件内容真值，且不依赖数据库。
 */
import { createHash } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeDatabaseBackupFileSha256 } from '../http/native/native-postgres-backup';

async function main(): Promise<void> {
  const directory = await fsPromises.mkdtemp(join(tmpdir(), 'gm-database-backup-hash-smoke-'));
  const filePath = join(directory, 'server-database-backup-smoke.dump');
  const fileBytes = Buffer.concat([
    Buffer.from('PGDMP'),
    Buffer.from('\nstreamed-hash-smoke\n'),
    Buffer.alloc(128 * 1024, 0x5a),
  ]);

  try {
    await fsPromises.writeFile(filePath, fileBytes, { mode: 0o600 });
    const expected = createHash('sha256').update(fileBytes).digest('hex');
    const actual = await computeDatabaseBackupFileSha256(filePath);
    if (actual !== expected) {
      throw new Error(`expected sha256=${expected}, got ${actual}`);
    }
    console.log(JSON.stringify({
      ok: true,
      answers: 'GM 数据库备份 SHA-256 计算与文件内容一致，验证不触碰数据库',
      excludes: '不证明真实 pg_dump/pg_restore、备份元数据持久化或远端磁盘吞吐',
    }, null, 2));
  } finally {
    await fsPromises.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
