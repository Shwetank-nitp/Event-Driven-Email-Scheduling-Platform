import client from "prom-client";

const registry = new client.Registry();

client.collectDefaultMetrics({
  register: registry,
  prefix: "worker_",
});

export const messagesProcessedTotal = new client.Counter({
  name: "messages_processed_total",
  help: "Total messages consumed by workers",
  registers: [registry],
});

export const messagesSentTotal = new client.Counter({
  name: "messages_sent_total",
  help: "Total successfully sent messages",
  registers: [registry],
});

export const messagesFailedTotal = new client.Counter({
  name: "messages_failed_total",
  help: "Total permanently failed messages",
  registers: [registry],
});

export const messagesRetriedTotal = new client.Counter({
  name: "messages_retried_total",
  help: "Total retry attempts",
  registers: [registry],
});

export const dlqMessagesTotal = new client.Counter({
  name: "dlq_messages_total",
  help: "Total messages sent to dead letter queue",
  registers: [registry],
});

export const workerUp = new client.Gauge({
  name: "worker_up",
  help: "Worker process health",
  registers: [registry],
});

export const activeJobsGauge = new client.Gauge({
  name: "active_jobs",
  help: "Current number of jobs being processed",
  registers: [registry],
});

export const redisLockFailuresTotal = new client.Counter({
  name: "redis_lock_failures_total",
  help: "Number of times a worker could not acquire a job lock",
  registers: [registry],
});

export const messageProcessingDuration = new client.Histogram({
  name: "message_processing_duration_seconds",
  help: "Time spent processing jobs",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export { registry };
