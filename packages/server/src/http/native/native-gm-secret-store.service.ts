/**
 * GM 密钥加密存储服务。
 * 使用 AES-256-GCM 对密钥值进行加密，持久化到 PostgreSQL 专表。
 * 主密钥通过环境变量 SERVER_SECRET_ENCRYPTION_KEY 派生。
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, BadRequestException, Inject } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Pool } from 'pg';
import { resolveServerDatabaseUrl, readTrimmedEnv } from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';

const SECRET_TABLE = 'server_gm_secrets';
const AES_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** 密钥记录结构。 */
export interface SecretRecord {
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

/** 密钥列表项（不含明文值）。
 *
 * N51 安全收口：原本 list 内对每条密钥都 decrypt 一遍只为生成 maskedValue —— 即一次 list 就把
 * 所有密钥的解密路径都跑一遍，且 mask 仍含部分明文片段。改成只回 metadata + 估算长度。
 */
export interface SecretListItem {
  key: string;
  description: string;
  /** 密钥明文长度的近似估算（基于密文段长度反推），不暴露任何明文内容。 */
  valueLength: number;
  updatedAt: string;
}

@Injectable()
export class NativeGmSecretStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NativeGmSecretStoreService.name);
  private pool: Pool | null = null;
  private encryptionKey: Buffer | null = null;

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    const masterKey = readTrimmedEnv('SERVER_SECRET_ENCRYPTION_KEY', 'SECRET_ENCRYPTION_KEY');
    if (!masterKey) {
      this.logger.warn('未配置 SERVER_SECRET_ENCRYPTION_KEY，密钥管理模块不可用');
      return;
    }
    this.encryptionKey = scryptSync(masterKey, 'gm-secret-store-salt', KEY_LENGTH);

    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      return;
    }
    const sharedPool = this.databasePoolProvider?.getPool('gm-secret-store') ?? null;
    if (!sharedPool) {
      this.logger.warn('密钥管理模块不可用：数据库连接池提供者未提供连接池');
      return;
    }
    this.pool = sharedPool;
    try {
      await this.ensureTable();
    } catch (error) {
      this.logger.error('密钥存储表初始化失败', error instanceof Error ? error.stack : String(error));
      this.pool = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
  }

  isAvailable(): boolean {
    return this.pool !== null && this.encryptionKey !== null;
  }

  async list(): Promise<SecretListItem[]> {
    this.assertAvailable();
    // N51：list 不再 decrypt 任何密钥；valueLength 由密文段长度反推（近似值，不含明文信息）。
    const result = await this.pool!.query(
      `SELECT secret_key, description, encrypted_value, updated_at_text FROM ${SECRET_TABLE} ORDER BY secret_key`,
    );
    return result.rows.map((row) => ({
      key: row.secret_key,
      description: row.description ?? '',
      valueLength: estimateSecretLength(row.encrypted_value),
      updatedAt: row.updated_at_text,
    }));
  }

  async get(key: string): Promise<SecretRecord | null> {
    this.assertAvailable();
    const result = await this.pool!.query(
      `SELECT secret_key, description, encrypted_value, updated_at_text FROM ${SECRET_TABLE} WHERE secret_key = $1`,
      [key],
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      key: row.secret_key,
      value: this.decrypt(row.encrypted_value),
      description: row.description ?? '',
      updatedAt: row.updated_at_text,
    };
  }

  async set(key: string, value: string, description: string): Promise<void> {
    this.assertAvailable();
    if (!key.trim()) throw new BadRequestException('密钥名不能为空');
    if (!value.trim()) throw new BadRequestException('密钥值不能为空');
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) {
      throw new BadRequestException('密钥名只允许字母开头，字母数字下划线连字符，最长64字符');
    }
    const encrypted = this.encrypt(value);
    const now = new Date().toISOString();
    await this.pool!.query(
      `INSERT INTO ${SECRET_TABLE}(secret_key, encrypted_value, description, updated_at_text, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (secret_key)
       DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value,
                     description = EXCLUDED.description,
                     updated_at_text = EXCLUDED.updated_at_text,
                     updated_at = now()`,
      [key.trim(), encrypted, description.trim(), now],
    );
  }

  async delete(key: string): Promise<boolean> {
    this.assertAvailable();
    const result = await this.pool!.query(
      `DELETE FROM ${SECRET_TABLE} WHERE secret_key = $1`,
      [key],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 供其他服务运行时读取密钥明文。 */
  async readSecret(key: string): Promise<string | null> {
    const record = await this.get(key);
    return record?.value ?? null;
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, this.encryptionKey!, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // 格式: iv:authTag:ciphertext (hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 3) throw new Error('密钥存储格式损坏');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = createDecipheriv(AES_ALGORITHM, this.encryptionKey!, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  private assertAvailable(): void {
    if (!this.isAvailable()) {
      throw new BadRequestException('密钥管理模块不可用：未配置 SERVER_SECRET_ENCRYPTION_KEY 或数据库未连接');
    }
  }

  private async ensureTable(): Promise<void> {
    const client = await this.pool!.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${SECRET_TABLE} (
          secret_key varchar(64) PRIMARY KEY,
          encrypted_value text NOT NULL,
          description varchar(256) NOT NULL DEFAULT '',
          updated_at_text varchar(80) NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    } finally {
      client.release();
    }
  }
}

/**
 * 从 AES-256-GCM 密文段长度估算明文字符数。
 *
 * 存储格式 `iv(12B):authTag(16B):ciphertext` 的 hex 表达；ciphertext 的字节数等于明文 UTF-8
 * 字节数（GCM 是 stream cipher，不 padding）。这里用 ciphertext 的 hex 字符数 / 2 作为估算
 * 上界 —— 不暴露任何明文片段，只提供"密钥大小量级"信息供 GM UI 显示长度提示。
 */
function estimateSecretLength(stored: unknown): number {
  if (typeof stored !== 'string') return 0;
  const parts = stored.split(':');
  if (parts.length !== 3) return 0;
  const ciphertextHex = parts[2] ?? '';
  // 估算明文 UTF-8 字节数（hex 字符数 / 2）；中文 / 多字节字符的"明文字符数"会略小于该字节数。
  return Math.max(0, Math.floor(ciphertextHex.length / 2));
}
