import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { Repository } from 'typeorm';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { AfdianOrderEntity } from '../database/entities/afdian-order.entity';
import type {
  AfdianApiSyncOrdersRequest,
  AfdianConfigForm,
  AfdianConfigStatus,
  AfdianOrderPayload,
  AfdianOrderListResponse,
  AfdianPingRequest,
  AfdianQueryOrderResponse,
  AfdianStoredOrderItem,
  AfdianSyncOrdersResponse,
} from './afdian.types';

const DEFAULT_AFDIAN_API_BASE_URL = 'https://afdian.net';
const DEFAULT_AFDIAN_WEBHOOK_PATH = '/integrations/afdian/webhook';
const AFDIAN_PING_PATH = '/api/open/ping';
const AFDIAN_QUERY_ORDER_PATH = '/api/open/query-order';
const AFDIAN_CONFIG_SCOPE = 'integration_config';
const AFDIAN_CONFIG_KEY = 'afdian';
const AFDIAN_KNOWN_HOSTS = new Set([
  'afdian.net',
  'www.afdian.net',
  'ifdian.net',
  'www.ifdian.net',
]);

type AfdianUpsertSource = 'webhook' | 'api';
type AfdianPersistentConfig = Omit<AfdianConfigForm, 'token'>;

@Injectable()
export class AfdianService implements OnModuleInit {
  private readonly logger = new Logger(AfdianService.name);
  private persistentConfig: AfdianPersistentConfig = readPersistentConfigFromEnv();
  private runtimeToken = readRuntimeTokenFromEnv();

  constructor(
    @InjectRepository(AfdianOrderEntity)
    private readonly afdianOrderRepo: Repository<AfdianOrderEntity>,
    private readonly persistentDocumentService: PersistentDocumentService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadPersistentConfig();
  }

  getConfigForm(): AfdianConfigForm {
    return {
      userId: this.persistentConfig.userId,
      token: '',
      apiBaseUrl: this.persistentConfig.apiBaseUrl,
      publicBaseUrl: this.persistentConfig.publicBaseUrl,
    };
  }

  getConfigStatus(): AfdianConfigStatus {
    const config = this.getConfigForm();
    const userId = normalizeEnvValue(config.userId);
    const token = normalizeEnvValue(this.runtimeToken);
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
    const nextConfig = normalizePersistentConfig(input);
    const nextRuntimeToken = normalizeEnvValue(input.token);

    await this.persistentDocumentService.save<AfdianPersistentConfig>(
      AFDIAN_CONFIG_SCOPE,
      AFDIAN_CONFIG_KEY,
      nextConfig,
    );

    this.persistentConfig = nextConfig;
    if (nextRuntimeToken !== null) {
      this.runtimeToken = nextRuntimeToken;
      process.env.AFDIAN_TOKEN = nextRuntimeToken;
    }
    process.env.AFDIAN_USER_ID = nextConfig.userId;
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
    const publicBaseUrl = normalizeEnvValue(this.persistentConfig.publicBaseUrl);
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

  async syncOrders(request: AfdianApiSyncOrdersRequest): Promise<AfdianSyncOrdersResponse> {
    const config = this.getRequiredApiConfig(request.token);
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

  async pingApi(request?: AfdianPingRequest): Promise<AfdianConfigStatus & { reachable: boolean }> {
    const config = this.getRequiredApiConfig(request?.token);
    await this.requestAfdianApi(config.userId, config.token, AFDIAN_PING_PATH, {});
    return {
      ...this.getConfigStatus(),
      reachable: true,
    };
  }

  private getRequiredApiConfig(requestToken?: string): { userId: string; token: string } {
    const userId = normalizeEnvValue(this.persistentConfig.userId);
    const token = normalizeEnvValue(requestToken) ?? normalizeEnvValue(this.runtimeToken);
    if (userId === null || token === null) {
      throw new ServiceUnavailableException('AFDIAN_USER_ID 或 AFDIAN_TOKEN 未配置');
    }
    return { userId, token };
  }

  private getApiBaseUrl(): string {
    return this.persistentConfig.apiBaseUrl;
  }

  private async loadPersistentConfig(): Promise<void> {
    const persisted = await this.persistentDocumentService.get<Partial<AfdianPersistentConfig>>(
      AFDIAN_CONFIG_SCOPE,
      AFDIAN_CONFIG_KEY,
    );
    if (!persisted) {
      process.env.AFDIAN_USER_ID = this.persistentConfig.userId;
      process.env.AFDIAN_API_BASE_URL = this.persistentConfig.apiBaseUrl;
      process.env.AFDIAN_PUBLIC_BASE_URL = this.persistentConfig.publicBaseUrl;
      if (this.runtimeToken.length > 0) {
        process.env.AFDIAN_TOKEN = this.runtimeToken;
      }
      return;
    }

    this.persistentConfig = normalizeStoredPersistentConfig(persisted);
    process.env.AFDIAN_USER_ID = this.persistentConfig.userId;
    process.env.AFDIAN_API_BASE_URL = this.persistentConfig.apiBaseUrl;
    process.env.AFDIAN_PUBLIC_BASE_URL = this.persistentConfig.publicBaseUrl;
    if (this.runtimeToken.length > 0) {
      process.env.AFDIAN_TOKEN = this.runtimeToken;
    }
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
    const response = await this.requestAfdianApi(userId, token, AFDIAN_QUERY_ORDER_PATH, params);
    return response as AfdianQueryOrderResponse;
  }

  private async requestAfdianApi(
    userId: string,
    token: string,
    apiPath: string,
    params: Record<string, string | number>,
  ): Promise<Record<string, unknown>> {
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

    const url = new URL(`${this.getApiBaseUrl().replace(/\/+$/u, '')}${apiPath}`);
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
    return response;
  }
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
          const responseSummary = summarizeUpstreamResponse(text);
          reject(new InternalServerErrorException(
            `爱发电 API 请求失败: ${url.toString()} 返回 HTTP ${res.statusCode ?? 500}${responseSummary ? `，响应: ${responseSummary}` : ''}`,
          ));
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

function summarizeUpstreamResponse(value: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) {
    return '';
  }
  return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
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
    apiBaseUrl: normalizeApiBaseUrl(input.apiBaseUrl),
    publicBaseUrl: normalizePublicBaseUrl(input.publicBaseUrl),
  };
}

function normalizePersistentConfig(input: AfdianConfigForm): AfdianPersistentConfig {
  const normalized = normalizeConfigForm(input);
  return {
    userId: normalized.userId,
    apiBaseUrl: normalized.apiBaseUrl,
    publicBaseUrl: normalized.publicBaseUrl,
  };
}

function normalizeStoredPersistentConfig(input: Partial<AfdianPersistentConfig>): AfdianPersistentConfig {
  return {
    userId: typeof input.userId === 'string' ? input.userId.trim() : '',
    apiBaseUrl: readNormalizedApiBaseUrl(input.apiBaseUrl),
    publicBaseUrl: readNormalizedPublicBaseUrl(input.publicBaseUrl) ?? '',
  };
}

function readPersistentConfigFromEnv(): AfdianPersistentConfig {
  return {
    userId: normalizeEnvValue(process.env.AFDIAN_USER_ID) ?? '',
    apiBaseUrl: readNormalizedApiBaseUrl(process.env.AFDIAN_API_BASE_URL),
    publicBaseUrl: readNormalizedPublicBaseUrl(process.env.AFDIAN_PUBLIC_BASE_URL) ?? '',
  };
}

function readRuntimeTokenFromEnv(): string {
  return normalizeEnvValue(process.env.AFDIAN_TOKEN) ?? '';
}

function readNormalizedApiBaseUrl(value: unknown): string {
  const normalized = normalizeBaseUrlValue(value, {
    fieldLabel: '爱发电 API 地址',
    defaultValue: DEFAULT_AFDIAN_API_BASE_URL,
    preservePath: false,
    canonicalizeAfdianHost: true,
    throwOnInvalid: false,
  });
  return normalized ?? DEFAULT_AFDIAN_API_BASE_URL;
}

function readNormalizedPublicBaseUrl(value: unknown): string | null {
  return normalizeBaseUrlValue(value, {
    fieldLabel: '公网地址',
    defaultValue: '',
    preservePath: true,
    canonicalizeAfdianHost: false,
    throwOnInvalid: false,
  });
}

function normalizeApiBaseUrl(value: string): string {
  return normalizeBaseUrlValue(value, {
    fieldLabel: '爱发电 API 地址',
    defaultValue: DEFAULT_AFDIAN_API_BASE_URL,
    preservePath: false,
    canonicalizeAfdianHost: true,
    throwOnInvalid: true,
  }) ?? DEFAULT_AFDIAN_API_BASE_URL;
}

function normalizePublicBaseUrl(value: string): string {
  return normalizeBaseUrlValue(value, {
    fieldLabel: '公网地址',
    defaultValue: '',
    preservePath: true,
    canonicalizeAfdianHost: false,
    throwOnInvalid: true,
  }) ?? '';
}

function normalizeBaseUrlValue(
  value: unknown,
  options: {
    fieldLabel: string;
    defaultValue: string;
    preservePath: boolean;
    canonicalizeAfdianHost: boolean;
    throwOnInvalid: boolean;
  },
): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length === 0) {
    return options.defaultValue.length > 0 ? options.defaultValue : null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    if (options.throwOnInvalid) {
      throw new BadRequestException(`${options.fieldLabel} 格式不正确，必须以 http:// 或 https:// 开头`);
    }
    return options.defaultValue.length > 0 ? options.defaultValue : null;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    if (options.throwOnInvalid) {
      throw new BadRequestException(`${options.fieldLabel} 仅支持 http:// 或 https://`);
    }
    return options.defaultValue.length > 0 ? options.defaultValue : null;
  }

  if (options.canonicalizeAfdianHost && AFDIAN_KNOWN_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    return DEFAULT_AFDIAN_API_BASE_URL;
  }

  const normalizedPath = options.preservePath
    ? parsedUrl.pathname.replace(/\/+$/u, '')
    : '';
  return `${parsedUrl.protocol}//${parsedUrl.host}${normalizedPath}`;
}
