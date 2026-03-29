import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';
import { Repository } from 'typeorm';
import { AfdianOrderEntity } from '../database/entities/afdian-order.entity';
import type {
  AfdianConfigForm,
  AfdianConfigStatus,
  AfdianOrderPayload,
  AfdianOrderListResponse,
  AfdianQueryOrderResponse,
  AfdianStoredOrderItem,
  AfdianSyncOrdersRequest,
  AfdianSyncOrdersResponse,
} from './afdian.types';

const DEFAULT_AFDIAN_API_BASE_URL = 'https://afdian.net';
const DEFAULT_AFDIAN_WEBHOOK_PATH = '/integrations/afdian/webhook';
const AFDIAN_QUERY_ORDER_PATH = '/api/open/query-order';
const AFDIAN_ENV_KEYS = [
  'AFDIAN_USER_ID',
  'AFDIAN_TOKEN',
  'AFDIAN_API_BASE_URL',
  'AFDIAN_PUBLIC_BASE_URL',
] as const;

type AfdianUpsertSource = 'webhook' | 'api';

@Injectable()
export class AfdianService {
  private readonly logger = new Logger(AfdianService.name);

  constructor(
    @InjectRepository(AfdianOrderEntity)
    private readonly afdianOrderRepo: Repository<AfdianOrderEntity>,
  ) {}

  getConfigForm(): AfdianConfigForm {
    return {
      userId: process.env.AFDIAN_USER_ID?.trim() ?? '',
      token: process.env.AFDIAN_TOKEN ?? '',
      apiBaseUrl: process.env.AFDIAN_API_BASE_URL?.trim() || DEFAULT_AFDIAN_API_BASE_URL,
      publicBaseUrl: process.env.AFDIAN_PUBLIC_BASE_URL?.trim() ?? '',
    };
  }

  getConfigStatus(): AfdianConfigStatus {
    const config = this.getConfigForm();
    const userId = normalizeEnvValue(config.userId);
    const token = normalizeEnvValue(config.token);
    const webhookPath = this.getWebhookPath();
    return {
      enabled: userId !== null,
      apiEnabled: userId !== null && token !== null,
      webhookPath,
      webhookUrl: this.getWebhookUrl(webhookPath),
      apiBaseUrl: config.apiBaseUrl,
      userId,
      hasToken: token !== null,
    };
  }

  async saveConfig(input: AfdianConfigForm): Promise<{ config: AfdianConfigForm; status: AfdianConfigStatus }> {
    const nextConfig = normalizeConfigForm(input);
    await writeServerEnvFile({
      AFDIAN_USER_ID: nextConfig.userId,
      AFDIAN_TOKEN: nextConfig.token,
      AFDIAN_API_BASE_URL: nextConfig.apiBaseUrl,
      AFDIAN_PUBLIC_BASE_URL: nextConfig.publicBaseUrl,
    });
    process.env.AFDIAN_USER_ID = nextConfig.userId;
    process.env.AFDIAN_TOKEN = nextConfig.token;
    process.env.AFDIAN_API_BASE_URL = nextConfig.apiBaseUrl;
    process.env.AFDIAN_PUBLIC_BASE_URL = nextConfig.publicBaseUrl;
    return {
      config: this.getConfigForm(),
      status: this.getConfigStatus(),
    };
  }

  getWebhookPath(): string {
    return DEFAULT_AFDIAN_WEBHOOK_PATH;
  }

  getWebhookUrl(webhookPath = this.getWebhookPath()): string | null {
    const publicBaseUrl = readEnvString('AFDIAN_PUBLIC_BASE_URL');
    if (publicBaseUrl === null) {
      return null;
    }
    return `${publicBaseUrl.replace(/\/+$/u, '')}${webhookPath}`;
  }

  async handleWebhook(payload: unknown): Promise<void> {
    const envelope = asRecord(payload);
    if (envelope === null) {
      throw new BadRequestException('Webhook body 必须为 JSON 对象');
    }

    const data = asRecord(envelope.data);
    const type = typeof data?.type === 'string' ? data.type : '';
    if (type !== 'order') {
      this.logger.warn(`收到未知爱发电 webhook 类型: ${type || 'unknown'}`);
      return;
    }

    const order = this.parseOrderPayload(data?.order);
    await this.upsertOrder(order, 'webhook', envelope);
  }

  async listStoredOrders(input: {
    limit?: number;
    offset?: number;
    status?: number;
    userId?: string;
    planId?: string;
  }): Promise<AfdianOrderListResponse> {
    const limit = clampInteger(input.limit, 20, 1, 100);
    const offset = clampInteger(input.offset, 0, 0, 100000);

    const queryBuilder = this.afdianOrderRepo.createQueryBuilder('order')
      .orderBy('order.updatedAt', 'DESC')
      .addOrderBy('order.outTradeNo', 'DESC')
      .skip(offset)
      .take(limit);

    if (typeof input.status === 'number' && Number.isFinite(input.status)) {
      queryBuilder.andWhere('order.status = :status', { status: Math.trunc(input.status) });
    }
    if (typeof input.userId === 'string' && input.userId.trim().length > 0) {
      queryBuilder.andWhere('order.userId = :userId', { userId: input.userId.trim() });
    }
    if (typeof input.planId === 'string' && input.planId.trim().length > 0) {
      queryBuilder.andWhere('order.planId = :planId', { planId: input.planId.trim() });
    }

    const [entities, total] = await queryBuilder.getManyAndCount();
    return {
      total,
      limit,
      offset,
      items: entities.map((entity) => this.toStoredOrderItem(entity)),
    };
  }

  async syncOrders(request: AfdianSyncOrdersRequest): Promise<AfdianSyncOrdersResponse> {
    const config = this.getRequiredApiConfig();
    const queryByOrderNo = request.outTradeNo?.trim() ?? '';
    const startPage = clampInteger(request.page, 1, 1, 999999);
    const maxPages = clampInteger(request.maxPages, 1, 1, 20);

    let syncedPages = 0;
    let receivedOrders = 0;
    let upsertedOrders = 0;
    let totalCount: number | null = null;
    let totalPage: number | null = null;

    if (queryByOrderNo.length > 0) {
      const response = await this.queryOrdersFromApi(config.userId, config.token, {
        out_trade_no: queryByOrderNo,
      });
      const orders = this.extractOrderList(response);
      syncedPages = 1;
      receivedOrders = orders.length;
      upsertedOrders += await this.upsertOrders(orders, 'api');
      totalCount = typeof response.data?.total_count === 'number' ? response.data.total_count : orders.length;
      totalPage = typeof response.data?.total_page === 'number' ? response.data.total_page : 1;
      return {
        requestedPages: 1,
        syncedPages,
        receivedOrders,
        upsertedOrders,
        totalCount,
        totalPage,
      };
    }

    for (let index = 0; index < maxPages; index += 1) {
      const page = startPage + index;
      const response = await this.queryOrdersFromApi(config.userId, config.token, { page });
      const orders = this.extractOrderList(response);
      syncedPages += 1;
      receivedOrders += orders.length;
      upsertedOrders += await this.upsertOrders(orders, 'api');
      totalCount = typeof response.data?.total_count === 'number' ? response.data.total_count : totalCount;
      totalPage = typeof response.data?.total_page === 'number' ? response.data.total_page : totalPage;
      if (orders.length === 0 || (typeof totalPage === 'number' && page >= totalPage)) {
        break;
      }
    }

    return {
      requestedPages: maxPages,
      syncedPages,
      receivedOrders,
      upsertedOrders,
      totalCount,
      totalPage,
    };
  }

  async pingApi(): Promise<AfdianConfigStatus & { reachable: boolean }> {
    const config = this.getRequiredApiConfig();
    await this.queryOrdersFromApi(config.userId, config.token, { page: 1 });
    return {
      ...this.getConfigStatus(),
      reachable: true,
    };
  }

  private getRequiredApiConfig(): { userId: string; token: string } {
    const userId = readEnvString('AFDIAN_USER_ID');
    const token = readEnvString('AFDIAN_TOKEN');
    if (userId === null || token === null) {
      throw new ServiceUnavailableException('AFDIAN_USER_ID 或 AFDIAN_TOKEN 未配置');
    }
    return { userId, token };
  }

  private getApiBaseUrl(): string {
    return readEnvString('AFDIAN_API_BASE_URL') ?? DEFAULT_AFDIAN_API_BASE_URL;
  }

  private parseOrderPayload(value: unknown): AfdianOrderPayload {
    const record = asRecord(value);
    const outTradeNo = readRequiredString(record?.out_trade_no, 'out_trade_no');
    const userId = readRequiredString(record?.user_id, 'user_id');
    return {
      ...record,
      out_trade_no: outTradeNo,
      user_id: userId,
    };
  }

  private extractOrderList(response: AfdianQueryOrderResponse): AfdianOrderPayload[] {
    if (response.ec !== 200) {
      throw new BadRequestException(response.em || '爱发电 API 返回失败');
    }
    const list = Array.isArray(response.data?.list) ? response.data.list : [];
    return list.map((item) => this.parseOrderPayload(item));
  }

  private async upsertOrders(orders: AfdianOrderPayload[], source: AfdianUpsertSource): Promise<number> {
    let upserted = 0;
    for (const order of orders) {
      await this.upsertOrder(order, source, order as Record<string, unknown>);
      upserted += 1;
    }
    return upserted;
  }

  private async upsertOrder(
    order: AfdianOrderPayload,
    source: AfdianUpsertSource,
    rawPayload: Record<string, unknown>,
  ): Promise<void> {
    const normalized = normalizeOrder(order);
    const entity = this.afdianOrderRepo.create({
      ...normalized,
      lastSource: source,
      rawPayload,
    });
    await this.afdianOrderRepo.save(entity);
  }

  private toStoredOrderItem(entity: AfdianOrderEntity): AfdianStoredOrderItem {
    return {
      outTradeNo: entity.outTradeNo,
      userId: entity.userId,
      userPrivateId: entity.userPrivateId,
      planId: entity.planId,
      title: entity.title,
      month: entity.month,
      totalAmount: entity.totalAmount,
      showAmount: entity.showAmount,
      status: entity.status,
      remark: entity.remark,
      redeemId: entity.redeemId,
      productType: entity.productType,
      discount: entity.discount,
      skuDetail: Array.isArray(entity.skuDetail) ? entity.skuDetail : [],
      addressPerson: entity.addressPerson,
      addressPhone: entity.addressPhone,
      addressAddress: entity.addressAddress,
      lastSource: entity.lastSource,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private async queryOrdersFromApi(
    userId: string,
    token: string,
    params: Record<string, string | number>,
  ): Promise<AfdianQueryOrderResponse> {
    const ts = Math.floor(Date.now() / 1000);
    const paramsJson = JSON.stringify(params);
    const signSource = `${token}params${paramsJson}ts${ts}user_id${userId}`;
    const sign = createHash('md5').update(signSource).digest('hex');

    const body = JSON.stringify({
      user_id: userId,
      params: paramsJson,
      ts,
      sign,
    });

    const url = new URL(`${this.getApiBaseUrl().replace(/\/+$/u, '')}${AFDIAN_QUERY_ORDER_PATH}`);
    const responseText = await sendJsonRequest(url, body);
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText) as unknown;
    } catch (error) {
      throw new InternalServerErrorException(`爱发电 API 返回了非 JSON 数据: ${String(error)}`);
    }
    const response = asRecord(parsed);
    if (response === null || typeof response.ec !== 'number' || typeof response.em !== 'string') {
      throw new InternalServerErrorException('爱发电 API 返回结构不合法');
    }
    return response as unknown as AfdianQueryOrderResponse;
  }
}

function readEnvString(key: string): string | null {
  return normalizeEnvValue(process.env[key]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`爱发电字段 ${fieldName} 缺失`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException(`爱发电字段 ${fieldName} 为空`);
  }
  return trimmed;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = readInteger(value, fallback);
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function normalizeOrder(order: AfdianOrderPayload): Partial<AfdianOrderEntity> {
  return {
    outTradeNo: order.out_trade_no.trim(),
    userId: order.user_id.trim(),
    userPrivateId: readOptionalString(order.user_private_id),
    planId: readOptionalString(order.plan_id),
    title: readOptionalString(order.title),
    month: readInteger(order.month),
    totalAmount: readOptionalString(order.total_amount) ?? '0.00',
    showAmount: readOptionalString(order.show_amount) ?? '0.00',
    status: readInteger(order.status),
    remark: readOptionalString(order.remark),
    redeemId: readOptionalString(order.redeem_id),
    productType: readInteger(order.product_type),
    discount: readOptionalString(order.discount) ?? '0.00',
    skuDetail: Array.isArray(order.sku_detail) ? order.sku_detail : [],
    addressPerson: readOptionalString(order.address_person),
    addressPhone: readOptionalString(order.address_phone),
    addressAddress: readOptionalString(order.address_address),
  };
}

async function sendJsonRequest(url: URL, body: string): Promise<string> {
  const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<string>((resolve, reject) => {
    const req = requestImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if ((res.statusCode ?? 500) >= 400) {
          reject(new InternalServerErrorException(`爱发电 API 请求失败: HTTP ${res.statusCode ?? 500}`));
          return;
        }
        resolve(text);
      });
    });

    req.on('error', (error) => {
      reject(new InternalServerErrorException(`爱发电 API 请求失败: ${String(error)}`));
    });

    req.write(body);
    req.end();
  });
}

function normalizeEnvValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeConfigForm(input: AfdianConfigForm): AfdianConfigForm {
  return {
    userId: input.userId.trim(),
    token: input.token.trim(),
    apiBaseUrl: input.apiBaseUrl.trim() || DEFAULT_AFDIAN_API_BASE_URL,
    publicBaseUrl: input.publicBaseUrl.trim(),
  };
}

async function writeServerEnvFile(values: Record<(typeof AFDIAN_ENV_KEYS)[number], string>): Promise<void> {
  const envPath = await resolveServerEnvPath();
  await fs.mkdir(dirname(envPath), { recursive: true });

  let current = '';
  try {
    current = await fs.readFile(envPath, 'utf8');
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const lines = current.length > 0 ? current.split(/\r?\n/u) : [];
  const remainingKeys = new Set<string>(AFDIAN_ENV_KEYS);
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/u);
    const key = match?.[1];
    if (!key || !remainingKeys.has(key)) {
      nextLines.push(line);
      continue;
    }
    nextLines.push(`${key}=${serializeEnvValue(values[key as keyof typeof values])}`);
    remainingKeys.delete(key);
  }

  for (const key of AFDIAN_ENV_KEYS) {
    if (remainingKeys.has(key)) {
      nextLines.push(`${key}=${serializeEnvValue(values[key])}`);
    }
  }

  const text = `${trimTrailingEmptyLines(nextLines).join('\n')}\n`;
  await fs.writeFile(envPath, text, 'utf8');
}

async function resolveServerEnvPath(): Promise<string> {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'packages', 'server', '.env'),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return candidates[0]!;
}

function serializeEnvValue(value: string): string {
  if (value.length === 0) {
    return '';
  }
  return /[\s#"'\\]/u.test(value) ? JSON.stringify(value) : value;
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  const nextLines = [...lines];
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
    nextLines.pop();
  }
  return nextLines;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT';
}
