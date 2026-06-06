import amqplib, { Channel, ChannelModel } from "amqplib";
import { logger } from "../utils/logger";

export const QUEUES = {
  MESSAGE_SEND: "MESSAGE.send",
  MESSAGE_RETRY: "MESSAGE.retry",
  MESSAGE_DEAD_LETTERS: "MESSAGE.dlq",
  // Add more queues here
} as const;

export const EXCHANGES = {
  MESSAGE: "MESSAGE.exchange",
  DEAD_LETTER: "DLX.exchange",
  // Add more exchanges here
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let retryCount = 0;
let isShuttingDown = false;

const MAX_RETRIES = parseInt(process.env.RABBITMQ_MAX_RETRIES || "10");
const RETRY_DELAY_MS = parseInt(process.env.RABBITMQ_RETRY_DELAY_MS || "3000");
const PREFETCH_COUNT = parseInt(process.env.RABBITMQ_PREFETCH || "10");

async function assertTopology(ch: Channel): Promise<void> {
  await ch.assertExchange(EXCHANGES.DEAD_LETTER, "direct", { durable: true });

  await ch.assertExchange(EXCHANGES.MESSAGE, "direct", { durable: true });

  await ch.assertQueue(QUEUES.MESSAGE_SEND, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EXCHANGES.DEAD_LETTER,
      // "x-message-ttl": 60_000,
    },
  });

  await ch.assertQueue(QUEUES.MESSAGE_RETRY, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EXCHANGES.MESSAGE,
      "x-dead-letter-routing-key": QUEUES.MESSAGE_SEND,
      "x-message-ttl": 30_000,
    },
  });

  await ch.assertQueue(QUEUES.MESSAGE_DEAD_LETTERS, {
    durable: true,
  });

  // Bindings
  await ch.bindQueue(
    QUEUES.MESSAGE_SEND,
    EXCHANGES.MESSAGE,
    QUEUES.MESSAGE_SEND
  );
  await ch.bindQueue(
    QUEUES.MESSAGE_RETRY,
    EXCHANGES.DEAD_LETTER,
    QUEUES.MESSAGE_RETRY
  );
  await ch.bindQueue(
    QUEUES.MESSAGE_DEAD_LETTERS,
    EXCHANGES.DEAD_LETTER,
    QUEUES.MESSAGE_DEAD_LETTERS
  );

  logger.info("RabbitMQ topology asserted");
}

async function connect(): Promise<void> {
  const url = process.env.RABBITMQ_URL || "amqp://localhost:5672";

  connection = await amqplib.connect(url);
  channel = await connection.createChannel();
  await channel.prefetch(PREFETCH_COUNT);
  await assertTopology(channel);

  connection.on("error", (err: Error) => {
    logger.error("RabbitMQ connection error", { message: err.message });
    scheduleReconnect();
  });

  connection.on("close", () => {
    if (isShuttingDown) return;
    logger.warn("RabbitMQ connection closed, reconnecting...");
    scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  connection = null;
  channel = null;

  if (retryCount >= MAX_RETRIES) {
    logger.error("RabbitMQ max reconnect attempts reached, shutting down");
    process.exit(1);
  }

  retryCount++;
  logger.info(
    `RabbitMQ reconnecting (attempt ${retryCount}/${MAX_RETRIES})...`
  );

  setTimeout(async () => {
    try {
      await connect();
      retryCount = 0;
      logger.info("RabbitMQ reconnected successfully");
    } catch (err) {
      scheduleReconnect();
    }
  }, RETRY_DELAY_MS);
}

/**
 * Called in bootstrap() — connects and asserts full broker topology.
 */
export async function connectRabbitMQ(): Promise<void> {
  logger.info("Connecting to RabbitMQ...");
  await connect();
  logger.info("RabbitMQ connected");
}

/**
 * Returns the active channel. Throws if called before connectRabbitMQ().
 */
export function getChannel(): Channel {
  if (!channel) {
    throw new Error(
      "RabbitMQ channel is not initialized. Call connectRabbitMQ() first."
    );
  }
  return channel;
}

/**
 * Graceful shutdown — call in SIGTERM/SIGINT handlers.
 */
export async function closeRabbitMQ(): Promise<void> {
  try {
    isShuttingDown = true;

    await channel?.close();
    await connection?.close();
    logger.info("RabbitMQ connection closed gracefully");
  } catch (err) {
    logger.error("Error closing RabbitMQ connection", err);
  }
}
