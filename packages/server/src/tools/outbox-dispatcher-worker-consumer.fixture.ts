import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export async function consumeOutboxEvent(event: Record<string, unknown>): Promise<void> {
  const shouldFail = /^(1|true|yes|on)$/iu.test(
    String(process.env.SERVER_OUTBOX_WORKER_CONSUMER_FAIL ?? process.env.DATABASE_OUTBOX_WORKER_CONSUMER_FAIL ?? '').trim(),
  );
  if (shouldFail) {
    throw new Error('synthetic_outbox_worker_consumer_failure');
  }
  const logPath = String(
    process.env.SERVER_OUTBOX_WORKER_CONSUME_LOG
      ?? process.env.DATABASE_OUTBOX_WORKER_CONSUME_LOG
      ?? '',
  ).trim();
  if (!logPath) {
    return;
  }
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(
    logPath,
    `${JSON.stringify({
      eventId: typeof event.event_id === 'string' ? event.event_id : null,
      operationId: typeof event.operation_id === 'string' ? event.operation_id : null,
      topic: typeof event.topic === 'string' ? event.topic : null,
    })}\n`,
    'utf8',
  );
}

export default consumeOutboxEvent;
