import cron, { ScheduledTask } from "node-cron";
import prisma from "../config/database";
import { QUEUES } from "../config/rabbitmq";
import { logger } from "../utils/logger";
import { JobStatus } from "generated/prisma/client";
import redisClient, { deleteCache } from "../config/redis";
import { publishToQueue } from "../queue/rabbitmq/producer";
import {
  restoreProcessingTasks,
  setJobArrayStatus,
} from "../repository/messageRepo";

let schedulerTask: ScheduledTask | null = null;

const SCHEDULER_CONFIG = {
  CRON_EXPRESSION: "*/30 * * * * *", // every 30 sec
  BATCH_SIZE: 100, // max jobs per tick
  LOCK_TIMEOUT_MINUTES: 5, // stuck job threshold
} as const;

const processScheduledJobs = async (): Promise<void> => {
  // prevent overlapping runs if DB is slow
  const lock = await redisClient.set("cron:lock", "1", "EX", 55, "NX");
  if (!lock) {
    logger.warn("Cron: another instance holds the lock, skipping");
    return;
  }

  try {
    const dueJobs = await prisma.messageJob.findMany({
      where: {
        status: JobStatus.PENDING,
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      take: SCHEDULER_CONFIG.BATCH_SIZE,
      select: { id: true, scheduledAt: true, userId: true, retryCount: true },
    });

    if (dueJobs.length === 0) {
      logger.debug("Cron: no due jobs found");
      return;
    }

    logger.info(`Cron: found ${dueJobs.length} due job(s)`);

    // mark as PROCESSING before publishing — prevents double dispatch
    await setJobArrayStatus(dueJobs, JobStatus.QUEUED);

    // publish to RabbitMQ
    await Promise.allSettled(
      dueJobs.map((job) =>
        publishToQueue(QUEUES.MESSAGE_SEND, {
          jobId: job.id,
          scheduledAt: job.scheduledAt,
          userId: job.userId,
          retryCount: job.retryCount,
        })
      )
    );
  } catch (err: any) {
    logger.error("Cron: scheduler tick failed", { error: err.message });
  } finally {
    await deleteCache("cron:lock");
  }
};

// jobs stuck in PROCESSING | QUEUED | RETRY beyond the lock timeout get reset to PENDING
const recoverStuckJobs = async (): Promise<void> => {
  try {
    const threshold = new Date(
      Date.now() - SCHEDULER_CONFIG.LOCK_TIMEOUT_MINUTES * 60 * 1000
    );

    const result = await restoreProcessingTasks(threshold);

    if (result.count > 0) {
      logger.warn(
        `Cron: recovered ${result.count} stuck job(s) back to PENDING`
      );
    }
  } catch (err: any) {
    logger.error("Cron: stuck job recovery failed", { error: err.message });
  }
};

export const startCronScheduler = (): void => {
  if (schedulerTask) {
    logger.warn("Cron: scheduler already running");
    return;
  }

  // validate cron expression before scheduling
  if (!cron.validate(SCHEDULER_CONFIG.CRON_EXPRESSION)) {
    throw new Error(
      `Invalid cron expression: ${SCHEDULER_CONFIG.CRON_EXPRESSION}`
    );
  }

  schedulerTask = cron.schedule(SCHEDULER_CONFIG.CRON_EXPRESSION, async () => {
    await processScheduledJobs();
    await recoverStuckJobs();
  });

  logger.info(
    `Cron: scheduler started — expression: "${SCHEDULER_CONFIG.CRON_EXPRESSION}"`
  );
};

export const stopCronScheduler = (): void => {
  if (!schedulerTask) return;
  schedulerTask.stop();
  schedulerTask = null;
  logger.info("Cron: scheduler stopped");
};
