"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishToDeadLetter = exports.publishToRetry = exports.publishMessageJob = exports.publishToQueue = void 0;
const rabbitmq_1 = require("../config/rabbitmq");
const rabbitmq_2 = require("../config/rabbitmq");
const logger_1 = require("../utils/logger");
const publishToQueue = (queue, message, options) => {
    const ch = (0, rabbitmq_1.getChannel)();
    const payload = Buffer.from(JSON.stringify(message));
    const result = ch.sendToQueue(queue, payload, {
        persistent: true,
        contentType: "application/json",
        timestamp: Date.now(),
        ...options,
    });
    if (!result) {
        logger_1.logger.warn(`publishToQueue: buffer full, message not queued`, { queue });
    }
    return result;
};
exports.publishToQueue = publishToQueue;
const publishMessageJob = (message) => {
    return (0, exports.publishToQueue)(rabbitmq_2.QUEUES.MESSAGE_SEND, message);
};
exports.publishMessageJob = publishMessageJob;
const publishToRetry = (message, reason) => {
    return (0, exports.publishToQueue)(rabbitmq_2.QUEUES.MESSAGE_RETRY, { ...message, reason });
};
exports.publishToRetry = publishToRetry;
const publishToDeadLetter = (message, reason) => {
    return (0, exports.publishToQueue)(rabbitmq_2.QUEUES.MESSAGE_DEAD_LETTERS, { ...message, reason });
};
exports.publishToDeadLetter = publishToDeadLetter;
