/**
 * 独立服务端 worker 的 Nest 应用上下文启动边界。
 *
 * 先加载本地 env 与数据库启动配置，再动态导入 AppModule，避免模块级 env 常量在 GM 配置落入 process.env 前求值。
 */
import '../config/bootstrap-local-development-runtime-defaults';

import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';

import { bootstrapLoadDbConfig } from '../config/bootstrap-load-db-config';

type ServerApplicationContextOptions = Parameters<typeof NestFactory.createApplicationContext>[1];

let bootstrapConfigLoadPromise: Promise<number> | null = null;

export function loadServerBootstrapConfigForContext(): Promise<number> {
  if (!bootstrapConfigLoadPromise) {
    bootstrapConfigLoadPromise = bootstrapLoadDbConfig();
  }
  return bootstrapConfigLoadPromise;
}

export async function createServerApplicationContextAfterBootstrapConfig(
  options: ServerApplicationContextOptions = { logger: false },
): Promise<INestApplicationContext> {
  const { AppModule } = await import('../app.module.js');
  return NestFactory.createApplicationContext(AppModule, options);
}

export async function createServerApplicationContext(
  options: ServerApplicationContextOptions = { logger: false },
): Promise<INestApplicationContext> {
  await loadServerBootstrapConfigForContext();
  return createServerApplicationContextAfterBootstrapConfig(options);
}
