import "dotenv/config";
import prisma from "../config/database";
import redisClient from "../config/redis";
import { connectRabbitMQ, getChannel, closeRabbitMQ } from "../config/rabbitmq";
import {
  publishToDeadLetter,
  publishToRetry,
} from "../queue/rabbitmq/producer";
import { logger } from "../utils/logger";
import { JobStatus } from "generated/prisma";
import { InvalidAddress, sendMessage } from "../services/mockEmailService";
import { QUEUES } from "../config/rabbitmq";
import {
  activeJobsGauge,
  dlqMessagesTotal,
  messageProcessingDuration,
  messagesFailedTotal,
  messagesProcessedTotal,
  messagesRetriedTotal,
  messagesSentTotal,
  redisLockFailuresTotal,
  registry,
  workerUp,
} from "../observability/metrics/worker/metrics";
import {
  getJobById,
  markJobFailed,
  markJobProcessing,
  markJobRetry,
  markJobSent,
} from "../repository/messageRepo";
import { bootPrometheusScrapper } from "../config/prometheus";

const MAX_RETRIES = 3;
const LOCK_TTL_SECONDS = 30;
const JOB_MATRICES_SERVER_PROT = parseInt(
  process.env.JOB_MATRICES_SERVER_PORT ?? "9001"
);

let isShuttingDown = false;
let isProcessing = false;

interface WorkerMessage {
  jobId: string;
  userId: string;
  scheduledAt: string;
  retryCount: number;
}

class SkipMessageError extends Error {
  constructor(reason?: string) {
    super(reason || "Skipping message");
    this.name = "SkipMessageError";
  }
}

class RetryError extends Error {
  nextRetryCount: number;
  constructor(nextRetryCount: number) {
    super("Retrying message");
    this.name = "RetryError";
    this.nextRetryCount = nextRetryCount;
  }
}

const startJobProcessingWorker = async (): Promise<void> => {
  try {
    bootPrometheusScrapper(JOB_MATRICES_SERVER_PROT, registry);
    logger.info("Worker: Started Monitoring");
    workerUp.set(1);

    await prisma.$connect();
    logger.info("Worker: database connected");

    await redisClient.connect();
    logger.info("Worker: redis connected");

    await connectRabbitMQ();
    const channel = getChannel();

    await channel.prefetch(1);
    logger.info("Worker: started, waiting for jobs...");

    channel.consume(
      QUEUES.MESSAGE_SEND,
      async (msg: any) => {
        if (!msg) return;

        if (isShuttingDown) {
          channel.nack(msg, false, true);
          return;
        }

        isProcessing = true;
        const timer = messageProcessingDuration.startTimer();
        activeJobsGauge.inc();

        let payload: WorkerMessage | null = null;

        try {
          // parse once, store in outer scope so catch block can access it
          payload = JSON.parse(msg.content.toString()) as WorkerMessage;
          const res = await processJob(payload);
          channel.ack(msg);

          if (res) messagesSentTotal.inc();
        } catch (err: any) {
          let isPermanentFailure = false;

          if (err instanceof SyntaxError) {
            // malformed message — drop it
            logger.error("Worker: invalid message payload, dropping", {
              error: err.message,
              raw: msg.content.toString(),
            });

            isPermanentFailure = true;
            channel.ack(msg);
          } else if (err instanceof SkipMessageError) {
            // job already handled or not found — ack and move on
            logger.warn("Worker: skipping message", { reason: err.message });
            channel.ack(msg);
          } else if (err instanceof RetryError) {
            // retry — publish to retry queue with incremented count
            if (payload) {
              publishToRetry(
                { ...payload, retryCount: err.nextRetryCount },
                "retrying the message"
              );
            }
            channel.ack(msg);
            messagesRetriedTotal.inc();
          } else {
            // unhandled error — publish to DLQ
            logger.error("Worker: unhandled consume error", {
              error: err.message,
            });
            if (payload) {
              publishToDeadLetter(payload, err.message);
            }
            channel.ack(msg);
            dlqMessagesTotal.inc();
            isPermanentFailure = true;
          }

          if (isPermanentFailure) {
            messagesFailedTotal.inc();
          }
        } finally {
          isProcessing = false;
          messagesProcessedTotal.inc();
          activeJobsGauge.dec();
          timer();
        }
      },
      { noAck: false }
    );
  } catch (err: any) {
    logger.error("Worker: startup failed", { error: err.message });
    process.exit(1);
  }
};

const processJob = async (message: WorkerMessage): Promise<boolean> => {
  const { jobId, userId } = message;
  const lockKey = `job:lock:${jobId}`;

  const lock = await redisClient.set(
    lockKey,
    "1",
    "EX",
    LOCK_TTL_SECONDS,
    "NX"
  );

  if (!lock) {
    logger.warn(`Worker: job already locked, skipping`, { jobId });
    redisLockFailuresTotal.inc();
    throw new SkipMessageError("job already locked");
  }

  try {
    const job = await getJobById(jobId);

    if (!job) {
      logger.warn(`Worker: job not found`, { jobId });
      throw new SkipMessageError("job not found");
    }

    if (job.status !== JobStatus.QUEUED && job.status !== JobStatus.RETRY) {
      logger.info(
        "Worker: Message must be QUEUED or RETRY to be eligible for processing",
        {
          jobId,
          status: job.status,
        }
      );

      throw new SkipMessageError(`job status is ${job.status}`);
    }

    await markJobProcessing(jobId);

    await sendMessage(userId, job.recipient, {
      subject: job.subject,
      body: job.body,
    });

    await markJobSent(jobId);

    logger.info(`Worker: job sent successfully`, { jobId });
  } catch (err: any) {
    // let SkipMessageError bubble up untouched
    if (err instanceof SkipMessageError) throw err;

    logger.error(`Worker: job failed`, { jobId, error: err.message });

    const currentRetryCount = message.retryCount;
    const maxRetries = MAX_RETRIES;

    if (currentRetryCount < maxRetries && !(err instanceof InvalidAddress)) {
      const nextRetryCount = currentRetryCount + 1;

      await markJobRetry(jobId, nextRetryCount, err.message);

      logger.warn(`Worker: queued for retry`, {
        jobId,
        attempt: `${nextRetryCount}/${maxRetries}`,
      });

      throw new RetryError(nextRetryCount);
    } else {
      await markJobFailed(jobId, err.message);

      publishToDeadLetter(
        {
          jobId,
          userId,
          scheduledAt: message.scheduledAt,
          retryCount: currentRetryCount,
        },
        err.message
      );

      messagesFailedTotal.inc();
      logger.error(`Worker: job permanently failed, sent to DLQ`, { jobId });
      dlqMessagesTotal.inc();

      return false;
    }
  } finally {
    await redisClient.del(lockKey);
  }

  return true;
};

const shutdown = async (): Promise<void> => {
  if (isShuttingDown) return;

  logger.info("Worker: shutdown signal received");
  isShuttingDown = true;
  workerUp.set(0);

  while (isProcessing) {
    logger.info("Worker: waiting for current job to finish...");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  try {
    await closeRabbitMQ();
    await redisClient.quit();
    await prisma.$disconnect();
    logger.info("Worker: shut down cleanly");
    process.exit(0);
  } catch (err: any) {
    logger.error("Worker: error during shutdown", { error: err.message });
    process.exit(1);
  } finally {
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

startJobProcessingWorker();
