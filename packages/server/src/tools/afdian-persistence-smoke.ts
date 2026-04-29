// @ts-nocheck

const pg = require("pg");
const core = require("@nestjs/core");

const { AppModule } = require("../app.module");
const { NativeGmAdminService } = require("../http/native/native-gm-admin.service");
const { resolveServerDatabaseUrl } = require("../config/env-alias");

const AFDIAN_CONFIG_TABLE = "server_afdian_config";
const CONFIG_KEY = "afdian";
const AFDIAN_ORDER_TABLE = "server_afdian_order";
/**
 * main：执行main相关逻辑。
 * @returns 无返回值，直接更新main相关状态。
 */


async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error("missing SERVER_DATABASE_URL/DATABASE_URL");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const app = await core.NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const service = app.get(NativeGmAdminService);
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM ${AFDIAN_CONFIG_TABLE} WHERE config_key = $1`, [CONFIG_KEY]).catch(() => undefined);
      await client.query(`DELETE FROM ${AFDIAN_ORDER_TABLE} WHERE out_trade_no = ANY($1::varchar[])`, [["native-order"]]).catch(() => undefined);
    }
    finally {
      client.release();
    }

    await service.saveAfdianConfig({
      userId: "native-user",
      apiBaseUrl: "https://native.example/api",
      publicBaseUrl: "https://native.example",
      token: "runtime-token",
    });
    await service.upsertAfdianOrders([
      {
        out_trade_no: "native-order",
        user_id: "native-user",
        status: 2,
        total_amount: "10.00",
        show_amount: "10.00",
        discount: "0.00",
        sku_detail: [],
        createdAt: "2026-04-17T00:00:00.000Z",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
    ], "api");
    await service.reloadPersistentCompatibilityState();

    const config = service.getAfdianConfig();
    const orders = await service.listAfdianOrders({ limit: 10, offset: 0 });

    if (config?.config?.userId !== "native-user") {
      throw new Error(`expected native afdian config, got ${JSON.stringify(config)}`);
    }
    if (typeof config?.status?.apiBaseUrl !== "string"
      || !config.status.apiBaseUrl.includes("native.example")
      || config.status.apiBaseUrl.includes("legacy.example")) {
      throw new Error(`expected native afdian apiBaseUrl, got ${JSON.stringify(config?.status)}`);
    }
    const orderIds = Array.isArray(orders?.items) ? orders.items.map((entry) => entry.outTradeNo) : [];
    if (!orderIds.includes("native-order")) {
      throw new Error(`expected structured afdian orders, got ${JSON.stringify(orderIds)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      configUserId: config.config.userId,
      apiBaseUrl: config.status.apiBaseUrl,
      orderIds,
      completionMapping: "05.gm-afdian-scopes.mainline-only",
    }, null, 2));
  }
  finally {
    await pool.query(`DELETE FROM ${AFDIAN_ORDER_TABLE} WHERE out_trade_no = ANY($1::varchar[])`, [["native-order"]]).catch(() => undefined);
    await pool.query(`DELETE FROM ${AFDIAN_CONFIG_TABLE} WHERE config_key = $1`, [CONFIG_KEY]).catch(() => undefined);
    await app.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
