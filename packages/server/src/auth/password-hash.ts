import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

interface ParsedScryptHash {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
  salt: Buffer;
  hash: string;
}

/** 对接收密码进行验证：统一验证 next 自定义 scrypt 格式。 */
export async function verifyPassword(password: unknown, storedHash: unknown): Promise<boolean> {
  const normalizedPassword = typeof password === 'string' ? password : '';
  const normalizedHash = typeof storedHash === 'string' ? storedHash : '';

  if (!normalizedHash) {
    return false;
  }

  const parsed = parseScryptHash(normalizedHash);
  if (!parsed) {
    return false;
  }

  const derived = scryptSync(normalizedPassword, parsed.salt, parsed.keyLength, {
    N: parsed.cost,
    r: parsed.blockSize,
    p: parsed.parallelization,
  });
  const expected = Buffer.from(parsed.hash, 'hex');

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** 生成密码存储串：统一写入 next 自定义前缀的 scrypt 格式。 */
export async function hashPassword(password: unknown): Promise<string> {
  const normalizedPassword = typeof password === 'string' ? password : '';
  const salt = randomBytes(16);
  const cost = 16384;
  const blockSize = 8;
  const parallelization = 1;
  const keyLength = 64;
  const hash = scryptSync(normalizedPassword, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });

  return `sn1$${cost}$${blockSize}$${parallelization}$${keyLength}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** 解析自定义 scrypt 存储串（sn1$cost$...），失败返回 null。 */
function parseScryptHash(value: string): ParsedScryptHash | null {
  const parts = value.split('$');
  if (parts.length !== 7 || parts[0] !== 'sn1') {
    return null;
  }

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  const keyLength = Number(parts[4]);
  const salt = Buffer.from(parts[5], 'hex');
  const hash = parts[6];

  if (
    !Number.isFinite(cost)
    || cost <= 1
    || !Number.isFinite(blockSize)
    || blockSize <= 0
    || !Number.isFinite(parallelization)
    || parallelization <= 0
    || !Number.isFinite(keyLength)
    || keyLength <= 0
    || salt.length === 0
    || !/^[0-9a-f]+$/i.test(hash)
  ) {
    return null;
  }

  return {
    cost: Math.trunc(cost),
    blockSize: Math.trunc(blockSize),
    parallelization: Math.trunc(parallelization),
    keyLength: Math.trunc(keyLength),
    salt,
    hash,
  };
}
