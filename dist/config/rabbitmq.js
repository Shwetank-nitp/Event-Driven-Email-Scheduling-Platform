"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCHANGES = exports.QUEUES = void 0;
exports.connectRabbitMQ = connectRabbitMQ;
exports.getChannel = getChannel;
exports.closeRabbitMQ = closeRabbitMQ;
const amqplib_1 = __importDefault(require("amqplib"));
const logger_1 = require("../utils/logger");
// ─── Constants ────────────────────────────────────────────────────────────────
exports.QUEUES = {
    MESSAGE_SEND: "MESSAGE.send",
    MESSAGE_RETRY: "MESSAGE.retry",
    MESSAGE_DEAD_LETTERS: "MESSAGE.dlq",
    // Add more queues here
};
exports.EXCHANGES = {
    MESSAGE: "MESSAGE.exchange",
    DEAD_LETTER: "DLX.exchange",
    // Add more exchanges here
};
// ─── State ────────────────────────────────────────────────────────────────────
let connection = null;
let channel = null;
let retryCount = 0;
const MAX_RETRIES = parseInt(process.env.RABBITMQ_MAX_RETRIES || "10");
const RETRY_DELAY_MS = parseInt(process.env.RABBITMQ_RETRY_DELAY_MS || "3000");
const PREFETCH_COUNT = parseInt(process.env.RABBITMQ_PREFETCH || "10");
// ─── Topology Setup ───────────────────────────────────────────────────────────
async function assertTopology(ch) {
    // Dead-letter exchange (must be asserted before queues that reference it)
    await ch.assertExchange(exports.EXCHANGES.DEAD_LETTER, "direct", { durable: true });
    // Main exchange
    await ch.assertExchange(exports.EXCHANGES.MESSAGE, "direct", { durable: true });
    // Queues
    await ch.assertQueue(exports.QUEUES.MESSAGE_SEND, {
        durable: true,
        arguments: {
            "x-dead-letter-exchange": exports.EXCHANGES.DEAD_LETTER,
            "x-message-ttl": 60000,
        },
    });
    await ch.assertQueue(exports.QUEUES.MESSAGE_RETRY, {
        durable: true,
        arguments: {
            "x-dead-letter-exchange": exports.EXCHANGES.MESSAGE, // re-routes back to main exchange after TTL
            "x-message-ttl": 30000, // retry delay
        },
    });
    await ch.assertQueue(exports.QUEUES.MESSAGE_DEAD_LETTERS, {
        durable: true,
    });
    // Bindings
    await ch.bindQueue(exports.QUEUES.MESSAGE_SEND, exports.EXCHANGES.MESSAGE, exports.QUEUES.MESSAGE_SEND);
    await ch.bindQueue(exports.QUEUES.MESSAGE_RETRY, exports.EXCHANGES.DEAD_LETTER, exports.QUEUES.MESSAGE_RETRY);
    await ch.bindQueue(exports.QUEUES.MESSAGE_DEAD_LETTERS, exports.EXCHANGES.DEAD_LETTER, exports.QUEUES.MESSAGE_DEAD_LETTERS);
    logger_1.logger.info("RabbitMQ topology asserted");
}
// ─── Connection ───────────────────────────────────────────────────────────────
async function connect() {
    const url = process.env.RABBITMQ_URL || "amqp://localhost:5672";
    connection = await amqplib_1.default.connect(url);
    channel = await connection.createChannel();
    await channel.prefetch(PREFETCH_COUNT);
    await assertTopology(channel);
    connection.on("error", (err) => {
        logger_1.logger.error("RabbitMQ connection error", { message: err.message });
        scheduleReconnect();
    });
    connection.on("close", () => {
        logger_1.logger.warn("RabbitMQ connection closed, reconnecting...");
        scheduleReconnect();
    });
}
function scheduleReconnect() {
    connection = null;
    channel = null;
    if (retryCount >= MAX_RETRIES) {
        logger_1.logger.error("RabbitMQ max reconnect attempts reached, shutting down");
        process.exit(1);
    }
    retryCount++;
    logger_1.logger.info(`RabbitMQ reconnecting (attempt ${retryCount}/${MAX_RETRIES})...`);
    setTimeout(async () => {
        try {
            await connect();
            retryCount = 0;
            logger_1.logger.info("RabbitMQ reconnected successfully");
        }
        catch (err) {
            scheduleReconnect();
        }
    }, RETRY_DELAY_MS);
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Called in bootstrap() — connects and asserts full broker topology.
 */
async function connectRabbitMQ() {
    logger_1.logger.info("Connecting to RabbitMQ...");
    await connect();
    logger_1.logger.info("RabbitMQ connected");
}
/**
 * Returns the active channel. Throws if called before connectRabbitMQ().
 */
function getChannel() {
    if (!channel) {
        throw new Error("RabbitMQ channel is not initialized. Call connectRabbitMQ() first.");
    }
    return channel;
}
/**
 * Graceful shutdown — call in SIGTERM/SIGINT handlers.
 */
async function closeRabbitMQ() {
    try {
        await channel?.close();
        await connection?.close();
        logger_1.logger.info("RabbitMQ connection closed gracefully");
    }
    catch (err) {
        logger_1.logger.error("Error closing RabbitMQ connection", err);
    }
}
