import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SERVER_PORT } from '@mud/shared';
import { PerformanceService } from './game/performance.service';

function getByteLength(chunk: unknown, encoding?: BufferEncoding): number {
  if (chunk === undefined || chunk === null) {
    return 0;
  }
  if (typeof chunk === 'string') {
    return Buffer.byteLength(chunk, encoding);
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.length;
  }
  if (chunk instanceof Uint8Array) {
    return chunk.byteLength;
  }
  return Buffer.byteLength(String(chunk));
}

function parseContentLengthHeader(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeHttpMetricPath(path: string): string {
  return path
    .replace(/\/gm\/players\/[^/]+$/u, '/gm/players/:playerId')
    .replace(/\/gm\/maps\/[^/]+$/u, '/gm/maps/:mapId');
}

function buildHttpMetricLabel(req: { method?: string; path?: string; originalUrl?: string; url?: string }): string {
  const method = (req.method ?? 'GET').toUpperCase();
  const rawPath = req.path
    ?? req.originalUrl?.split('?')[0]
    ?? req.url?.split('?')[0]
    ?? '/unknown';
  return `HTTP ${method} ${normalizeHttpMetricPath(rawPath)}`;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const performanceService = app.get(PerformanceService);

  app.use((req: { headers: Record<string, unknown>; method?: string; path?: string; originalUrl?: string; url?: string }, res: any, next: () => void) => {
    const metricLabel = buildHttpMetricLabel(req);
    performanceService.recordNetworkInBytes(parseContentLengthHeader(req.headers['content-length']), metricLabel, metricLabel);

    let responseBytes = 0;
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    res.write = ((chunk: unknown, encoding?: BufferEncoding, cb?: (...args: unknown[]) => void) => {
      responseBytes += getByteLength(chunk, encoding);
      return originalWrite(chunk, encoding, cb);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, encoding?: BufferEncoding, cb?: (...args: unknown[]) => void) => {
      responseBytes += getByteLength(chunk, encoding);
      performanceService.recordNetworkOutBytes(responseBytes, metricLabel, metricLabel);
      return originalEnd(chunk, encoding, cb);
    }) as typeof res.end;

    next();
  });

  app.enableShutdownHooks();
  app.enableCors();

  const port = Number(process.env.PORT) || SERVER_PORT;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  console.log(`Server running on http://${host}:${port}`);
}
bootstrap();
