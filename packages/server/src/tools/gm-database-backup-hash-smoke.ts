/**
 * 用途：验证 GM 数据库备份 SHA-256 计算使用文件内容真值，且不依赖数据库。
 */
import { createHash } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import {
  buildPostgresDumpFileName,
  computeDatabaseBackupFileSha256,
  detectDatabaseBackupFormat,
} from '../http/native/native-postgres-backup';

async function main(): Promise<void> {
  const directory = await fsPromises.mkdtemp(join(tmpdir(), 'gm-database-backup-hash-smoke-'));
  const filePath = join(directory, 'server-database-backup-smoke.dump');
  const gzipFileName = buildPostgresDumpFileName('smoke-gzip');
  const gzipFilePath = join(directory, gzipFileName);
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
    if (!gzipFileName.endsWith('.dump.gz')) {
      throw new Error(`expected generated PostgreSQL backup file name to end with .dump.gz, got ${gzipFileName}`);
    }
    const gzipBytes = gzipSync(fileBytes);
    await fsPromises.writeFile(gzipFilePath, gzipBytes, { mode: 0o600 });
    const gzipFormat = await detectDatabaseBackupFormat(gzipFilePath, gzipFileName);
    if (gzipFormat !== 'postgres_custom_dump') {
      throw new Error(`expected gzip PostgreSQL custom dump format, got ${gzipFormat}`);
    }
    const expectedGzipChecksum = createHash('sha256').update(gzipBytes).digest('hex');
    const actualGzipChecksum = await computeDatabaseBackupFileSha256(gzipFilePath);
    if (actualGzipChecksum !== expectedGzipChecksum) {
      throw new Error(`expected gzip sha256=${expectedGzipChecksum}, got ${actualGzipChecksum}`);
    }
    console.log(JSON.stringify({
      ok: true,
      answers: 'GM 数据库备份 SHA-256 计算与压缩文件内容一致，.dump.gz 能识别为 PostgreSQL custom dump，验证不触碰数据库',
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
