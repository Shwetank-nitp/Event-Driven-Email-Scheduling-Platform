"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const database_1 = __importDefault(require("../config/database"));
const rabbitmq_1 = require("../config/rabbitmq");
const logger_1 = require("../utils/logger");
const adminNotifier_1 = require("../services/adminNotifier");
const startFailureNotificationWorker = async () => {
    try {
        await database_1.default.$connect();
        await (0, rabbitmq_1.connectRabbitMQ)();
        const channel = (0, rabbitmq_1.getChannel)();
        await channel.prefetch(10);
        logger_1.logger.info("Failure notification worker started");
        channel.consume(rabbitmq_1.QUEUES.MESSAGE_FAILURE_USER_NOTIFY, async (msg) => {
            if (!msg)
                return;
            try {
                const event = JSON.parse(msg.content.toString());
                const existing = await database_1.default.failedJobNotification.findFirst({
                    where: { jobId: event.jobId },
                    select: { id: true },
                });
                if (!existing) {
                    await database_1.default.failedJobNotification.create({
                        data: {
                            userId: event.userId,
                            jobId: event.jobId,
                            recipient: event.recipient,
                            subject: event.subject,
                            errorMessage: event.errorMessage,
                            retryCount: event.retryCount,
                        },
                    });
                }
                channel.ack(msg);
            }
            catch (err) {
                logger_1.logger.error("Failed to persist user failure notification", {
                    error: err.message,
                });
                channel.nack(msg, false, true);
            }
        }, { noAck: false });
        channel.consume(rabbitmq_1.QUEUES.MESSAGE_FAILURE_ADMIN_NOTIFY, async (msg) => {
            if (!msg)
                return;
            try {
                const event = JSON.parse(msg.content.toString());
                await (0, adminNotifier_1.notifyAdminFailure)(event);
                channel.ack(msg);
            }
            catch (err) {
                logger_1.logger.error("Failed to send admin failure notification", {
                    error: err.message,
                });
                channel.nack(msg, false, true);
            }
        }, { noAck: false });
    }
    catch (err) {
        logger_1.logger.error("Failure notification worker failed to start", {
            error: err.message,
        });
        process.exit(1);
    }
};
const shutdown = async () => {
    try {
        await (0, rabbitmq_1.closeRabbitMQ)();
        await database_1.default.$disconnect();
        logger_1.logger.info("Failure notification worker shut down cleanly");
        process.exit(0);
    }
    catch (err) {
        logger_1.logger.error("Failure notification worker shutdown failed", {
            error: err.message,
        });
        process.exit(1);
    }
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
startFailureNotificationWorker();
