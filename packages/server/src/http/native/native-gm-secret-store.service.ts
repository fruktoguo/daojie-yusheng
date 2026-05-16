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

/** 密钥列表项（不含明文值）。 */
export interface SecretListItem {
  key: string;
  description: string;
  maskedValue: string;
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
      this.logger.warn('密钥管理模块不可用：DatabasePoolProvider 未提供连接池');
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
    const result = await this.pool!.query(
      `SELECT secret_key, description, encrypted_value, updated_at_text FROM ${SECRET_TABLE} ORDER BY secret_key`,
    );
    return result.rows.map((row) => ({
      key: row.secret_key,
      description: row.description ?? '',
      maskedValue: this.maskDecrypted(this.decrypt(row.encrypted_value)),
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

  private maskDecrypted(value: string): string {
    if (value.length <= 4) return '****';
    return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 8)) + value.slice(-2);
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
