import type {
  AfdianConfigForm,
  AfdianConfigStatus,
  AfdianOrderListResponse,
  AfdianStoredOrderItem,
  AfdianSyncOrdersRequest,
  AfdianSyncOrdersResponse,
} from '@mud/shared';

export interface AfdianSkuDetail {
  sku_id?: string;
  count?: number;
  name?: string;
  album_id?: string;
  pic?: string;
  [key: string]: unknown;
}

export interface AfdianOrderPayload {
  out_trade_no: string;
  user_id: string;
  user_private_id?: string;
  plan_id?: string;
  title?: string;
  month?: number;
  total_amount?: string;
  show_amount?: string;
  status?: number;
  remark?: string;
  redeem_id?: string;
  product_type?: number;
  discount?: string;
  sku_detail?: AfdianSkuDetail[];
  address_person?: string;
  address_phone?: string;
  address_address?: string;
  [key: string]: unknown;
}

export interface AfdianWebhookEnvelope {
  ec?: number;
  em?: string;
  data?: {
    type?: string;
    order?: AfdianOrderPayload;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AfdianQueryOrderResponse {
  ec: number;
  em: string;
  data?: {
    list?: AfdianOrderPayload[];
    total_count?: number;
    total_page?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AfdianPingRequest {
  token?: string;
}

export interface AfdianApiSyncOrdersRequest extends AfdianSyncOrdersRequest {
  token?: string;
}

export type {
  AfdianConfigForm,
  AfdianConfigStatus,
  AfdianOrderListResponse,
  AfdianStoredOrderItem,
  AfdianSyncOrdersRequest,
  AfdianSyncOrdersResponse,
};
