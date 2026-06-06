"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/workers/MESSAGEWorker.ts
require("dotenv/config");
const database_1 = __importDefault(require("../config/database"));
const redis_1 = __importDefault(require("../config/redis"));
const rabbitmq_1 = require("../config/rabbitmq");
const producer_1 = require("../utils/producer"); // removed unused publishToQueue
const logger_1 = require("../utils/logger");
const prisma_1 = require("../../generated/prisma");
const mockEmailService_1 = require("../services/mockEmailService");
const rabbitmq_2 = require("../config/rabbitmq");
// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const LOCK_TTL_SECONDS = 30;
// BLOCK_TTL_SECONDS is never used, removed
// ─── State ─────────────────────────────────────────────────────────────────────
let isShuttingDown = false;
let isProcessing = false;
// ─── Custom Error Classes (must be defined before use) ─────────────────────────
class SkipMessageError extends Error {
}
class RetryError extends Error {
    constructor(nextRetryCount) {
        super("Retrying message");
        this.nextRetryCount = nextRetryCount;
    }
}
// ─── Main Worker ───────────────────────────────────────────────────────────────
const startWorker = async () => {
    try {
        await database_1.default.$connect();
        logger_1.logger.info("Worker: database connected");
        await redis_1.default.connect();
        logger_1.logger.info("Worker: redis connected");
        await (0, rabbitmq_1.connectRabbitMQ)();
        const channel = (0, rabbitmq_1.getChannel)();
        // one message at a time per worker instance
        await channel.prefetch(1);
        logger_1.logger.info("Worker: started, waiting for jobs...");
        channel.consume(rabbitmq_2.QUEUES.MESSAGE_SEND, async (msg) => {
            if (!msg)
                return;
            // drain — stop accepting new messages during shutdown
            if (isShuttingDown) {
                channel.nack(msg, false, true);
                return;
            }
            isProcessing = true;
            let payload = null;
            try {
                const payload = JSON.parse(msg.content.toString());
                await processJob(payload); // FIX: removed the unused second argument
                payload = JSON.parse(msg.content.toString());
                await processJob(payload);
                channel.ack(msg);
            }
            catch (err) {
                if (err instanceof SyntaxError) {
                    logger_1.logger.error("Worker: invalid message payload, dropping message", {
                        error: err.message,
                        raw: msg.content.toString(),
                    });
                    channel.ack(msg);
                }
                else if (err instanceof SkipMessageError) {
                    channel.ack(msg);
                }
                else if (err instanceof RetryError) {
                    if (payload) {
                        (0, producer_1.publishToRetry)({ ...payload, retryCount: err.nextRetryCount }, "retrying the message");
                    }
                    channel.ack(msg);
                }
                else {
                    logger_1.logger.error("Worker: unhandled consume error", {
                        error: err.message,
                    });
                    if (payload) {
                        (0, producer_1.publishToDeadLetter)(payload, err.message);
                    }
                    channel.ack(msg);
                }
            }
            finally {
                isProcessing = false;
            }
        }, { noAck: false });
    }
    catch (err) {
        logger_1.logger.error("Worker: startup failed", { error: err.message });
        process.exit(1);
    }
};
// ─── Process Job ───────────────────────────────────────────────────────────────
const processJob = async (message) => {
    const { jobId, userId } = message;
    const lockKey = `job:lock:${jobId}`;
    // FIX: use options object for node-redis v4
    const lock = await redis_1.default.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!lock) {
        logger_1.logger.warn(`Worker: job already locked, skipping ${jobId}`);
        throw new SkipMessageError();
    }
    try {
        const job = await database_1.default.messageJob.findUnique({ where: { id: jobId } });
        if (!job) {
            logger_1.logger.warn(`Worker: job not found ${jobId}`);
            throw new SkipMessageError();
        }
        if (job.status !== prisma_1.JobStatus.PENDING &&
            job.status !== prisma_1.JobStatus.PROCESSING) {
            logger_1.logger.info(`Worker: job already handled ${jobId} (${job.status})`);
            throw new SkipMessageError();
        }
        await database_1.default.messageJob.update({
            where: { id: jobId },
            data: { status: prisma_1.JobStatus.PROCESSING },
        });
        await (0, mockEmailService_1.sendMessage)(userId, job.recipient, {
            subject: job.subject,
            body: job.body,
        });
        await database_1.default.messageJob.update({
            where: { id: jobId },
            data: {
                status: prisma_1.JobStatus.SENT,
                sentAt: new Date(),
                errorMessage: null,
            },
        });
        logger_1.logger.info(`Worker: job sent successfully ${jobId}`);
    }
    catch (err) {
        if (err instanceof SkipMessageError) {
            throw err;
        }
        logger_1.logger.error(`Worker: job failed ${jobId}`, { error: err.message });
        if (currentRetryCount < job.maxRetries && !(err instanceof mockEmailService_1.InvalidAddress)) {
            const nextRetryCount = job.retryCount + 1;
            await database_1.default.messageJob.update({
                where: { id: jobId },
                data: {
                    status: prisma_1.JobStatus.PENDING,
                    retryCount: nextRetryCount,
                    errorMessage: err.message,
                },
            });
            throw new RetryError(nextRetryCount);
        }
        // Max retries exceeded: mark as FAILED and send to DLQ
        await database_1.default.messageJob.update({
            where: { id: jobId },
            data: {
                status: prisma_1.JobStatus.FAILED,
                errorMessage: err.message,
            },
        });
        await (0, producer_1.publishToDeadLetter)({
            jobId,
            userId,
            scheduledAt: message.scheduledAt,
            retryCount: job.retryCount,
        }, err.message, rabbitmq_2.QUEUES.MESSAGE_DEAD_LETTERS);
    }
};
