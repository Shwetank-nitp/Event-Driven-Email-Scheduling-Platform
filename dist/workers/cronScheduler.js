"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopCronScheduler = exports.startCronScheduler = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = __importDefault(require("../config/database"));
const rabbitmq_1 = require("../config/rabbitmq");
const logger_1 = require("../utils/logger");
const client_1 = require("../../generated/prisma/client");
const redis_1 = __importStar(require("../config/redis"));
const producer_1 = require("../utils/producer");
// --- State ---
let schedulerTask = null;
// --- Config ---
const SCHEDULER_CONFIG = {
    CRON_EXPRESSION: "* * * * *", // every minute
    BATCH_SIZE: 100, // max jobs per tick
    LOCK_TIMEOUT_MINUTES: 5, // stuck job threshold
};
// --- Core Job ---
const processScheduledJobs = async () => {
    // prevent overlapping runs if DB is slow
    const lock = await redis_1.default.set("cron:lock", "1", "EX", 55, "NX");
    if (!lock) {
        logger_1.logger.warn("Cron: another instance holds the lock, skipping");
        return;
    }
    const tickStart = Date.now();
    try {
        // fetch due jobs in a single query
        const dueJobs = await database_1.default.messageJob.findMany({
            where: {
                status: client_1.JobStatus.PENDING,
                scheduledAt: { lte: new Date() },
            },
            orderBy: { scheduledAt: "asc" },
            take: SCHEDULER_CONFIG.BATCH_SIZE,
            select: { id: true, scheduledAt: true, userId: true },
        });
        if (dueJobs.length === 0) {
            logger_1.logger.debug("Cron: no due jobs found");
            return;
        }
        logger_1.logger.info(`Cron: found ${dueJobs.length} due job(s)`);
        // mark as PROCESSING before publishing — prevents double dispatch
        await database_1.default.messageJob.updateMany({
            where: { id: { in: dueJobs.map((j) => j.id) } },
            data: { status: client_1.JobStatus.PROCESSING },
        });
        // publish to RabbitMQ
        await Promise.allSettled(dueJobs.map((job) => (0, producer_1.publishToQueue)(rabbitmq_1.QUEUES.MESSAGE_SEND, {
            jobId: job.id,
            scheduledAt: job.scheduledAt,
            userId: job.userId,
            retryCount: 0,
        })));
    }
    catch (err) {
        logger_1.logger.error("Cron: scheduler tick failed", { error: err.message });
    }
    finally {
        await (0, redis_1.deleteCache)("cron:lock");
    }
};
// --- Stuck Job Recovery ---
// jobs stuck in PROCESSING beyond the lock timeout get reset to PENDING
const recoverStuckJobs = async () => {
    try {
        const threshold = new Date(Date.now() - SCHEDULER_CONFIG.LOCK_TIMEOUT_MINUTES * 60 * 1000);
        const result = await database_1.default.messageJob.updateMany({
            where: {
                status: client_1.JobStatus.PROCESSING,
                updatedAt: { lte: threshold },
            },
            data: { status: client_1.JobStatus.PENDING },
        });
        if (result.count > 0) {
            logger_1.logger.warn(`Cron: recovered ${result.count} stuck job(s) back to PENDING`);
        }
    }
    catch (err) {
        logger_1.logger.error("Cron: stuck job recovery failed", { error: err.message });
    }
};
// --- Start ---
const startCronScheduler = () => {
    if (schedulerTask) {
        logger_1.logger.warn("Cron: scheduler already running");
        return;
    }
    // validate cron expression before scheduling
    if (!node_cron_1.default.validate(SCHEDULER_CONFIG.CRON_EXPRESSION)) {
        throw new Error(`Invalid cron expression: ${SCHEDULER_CONFIG.CRON_EXPRESSION}`);
    }
    schedulerTask = node_cron_1.default.schedule(SCHEDULER_CONFIG.CRON_EXPRESSION, async () => {
        await processScheduledJobs();
        await recoverStuckJobs();
    });
    logger_1.logger.info(`Cron: scheduler started — expression: "${SCHEDULER_CONFIG.CRON_EXPRESSION}"`);
};
exports.startCronScheduler = startCronScheduler;
// --- Stop (graceful shutdown) ---
const stopCronScheduler = () => {
    if (!schedulerTask)
        return;
    schedulerTask.stop();
    schedulerTask = null;
    logger_1.logger.info("Cron: scheduler stopped");
};
exports.stopCronScheduler = stopCronScheduler;
