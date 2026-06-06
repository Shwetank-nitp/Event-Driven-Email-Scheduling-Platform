import "dotenv/config";

import { connectDB, runMigrations } from "./config/database";
import { connectRabbitMQ, closeRabbitMQ } from "./config/rabbitmq";
import { connectRedis } from "./config/redis";
import { startCronScheduler } from "./workers/schedulerWorker";

import { logger } from "./utils/logger";
import app from "./app";
import { bootPrometheusScrapper } from "./config/prometheus";
import { registry } from "./observability/metrics/app/metrics";

const PORT = parseInt(process.env.PORT || "3000");
const APP_METRICS_PORT = parseInt(process.env.METRICS_PORT || "9090");

const bootstrap = async (): Promise<void> => {
  await connectDB();
  await runMigrations();
  await connectRabbitMQ();
  await connectRedis();

  startCronScheduler();
  bootPrometheusScrapper(APP_METRICS_PORT, registry);

  app.listen(PORT, () => logger.info(`API server running on port ${PORT}`));
};

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down`);

  const timeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);

  try {
    await closeRabbitMQ();
    clearTimeout(timeout);
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

bootstrap().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
