import amqplib from "amqplib";
import { getChannel, QueueName, QUEUES } from "../../config/rabbitmq";
import { logger } from "../../utils/logger";

export interface MessageJobMessage {
  jobId: string;
  userId: string;
  scheduledAt: string;
  retryCount: number;
}

export const publishToQueue = (
  queue: QueueName,
  message: object,
  options?: amqplib.Options.Publish
): boolean => {
  const ch = getChannel();
  const payload = Buffer.from(JSON.stringify(message));

  const result = ch.sendToQueue(queue, payload, {
    persistent: true,
    contentType: "application/json",
    timestamp: Date.now(),
    ...options,
  });

  if (!result) {
    logger.warn(`publishToQueue: buffer full, message not queued`, { queue });
  }

  return result;
};

export const publishMessageJob = (message: MessageJobMessage): boolean => {
  return publishToQueue(QUEUES.MESSAGE_SEND, message);
};

export const publishToRetry = (message: object, reason: string): boolean => {
  return publishToQueue(QUEUES.MESSAGE_RETRY, { ...message, reason });
};

export const publishToDeadLetter = (
  message: object,
  reason: string
): boolean => {
  return publishToQueue(QUEUES.MESSAGE_DEAD_LETTERS, { ...message, reason });
};
