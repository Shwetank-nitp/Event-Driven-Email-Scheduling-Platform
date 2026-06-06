import z from "zod";
import { JobStatus, MessageJob, MessageType } from "generated/prisma/client";
import prisma from "../config/database";
import { createJobSchema } from "../routes/messages";

export async function getPaginatedJobs(
  limit: number,
  userId: string,
  skip: number
) {
  return Promise.all([
    prisma.messageJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.messageJob.count({ where: { userId } }),
  ]);
}

export async function getPaginatedInbox(
  limit: number,
  userId: string,
  skip: number
) {
  return Promise.all([
    prisma.message.findMany({
      where: { AND: [{ userId }, { type: MessageType.INBOX }] },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.message.count({
      where: { AND: [{ userId }, { type: MessageType.INBOX }] },
    }),
  ]);
}

export async function getPaginatedDraft(
  limit: number,
  userId: string,
  skip: number
) {
  return Promise.all([
    prisma.message.findMany({
      where: { AND: [{ userId }, { type: MessageType.DRAFT }] },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.message.count({
      where: { AND: [{ userId }, { type: MessageType.DRAFT }] },
    }),
  ]);
}

export async function getPaginatedSent(
  limit: number,
  userId: string,
  skip: number
) {
  return Promise.all([
    prisma.message.findMany({
      where: { AND: [{ userId }, { type: MessageType.SENT }] },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.message.count({
      where: { AND: [{ userId }, { type: MessageType.SENT }] },
    }),
  ]);
}

export async function createJob(
  userId: string,
  payload: z.infer<typeof createJobSchema>
) {
  return prisma.messageJob.create({
    data: {
      userId,
      recipient: payload.recipient,
      subject: payload.subject,
      body: payload.body,
      scheduledAt: payload.scheduledAt,
      status: JobStatus.PENDING,
    },
  });
}

export async function getJobById(jobId: string) {
  return prisma.messageJob.findUnique({ where: { id: jobId } });
}

export async function cancelJob(jobId: string) {
  return prisma.messageJob.update({
    where: { id: jobId },
    data: { status: JobStatus.CANCELLED },
  });
}

export async function getJobStats(userId: string) {
  return prisma.messageJob.groupBy({
    by: ["status"],
    where: { userId },
    _count: { status: true },
  });
}

export async function getMessageById(id: string) {
  return prisma.message.findUnique({ where: { id } });
}

export async function getMessageStats(userId: string) {
  return prisma.message.groupBy({
    by: ["type"],
    where: { userId },
    _count: { type: true },
  });
}

export async function setJobArrayStatus(
  dueJobs: (Pick<MessageJob, "id"> & Partial<Omit<MessageJob, "id">>)[],
  status: JobStatus
) {
  return prisma.messageJob.updateMany({
    where: { id: { in: dueJobs.map((j) => j.id) } },
    data: { status },
  });
}

export async function restoreProcessingTasks(threshold: Date) {
  return prisma.messageJob.updateMany({
    where: {
      OR: [{ status: JobStatus.PROCESSING }],
      updatedAt: { lte: threshold },
    },
    data: { status: JobStatus.PENDING },
  });
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  extraData?: Partial<
    Omit<
      MessageJob,
      | "id"
      | "userId"
      | "recipient"
      | "subject"
      | "body"
      | "scheduledAt"
      | "createdAt"
      | "updatedAt"
    >
  >
) {
  return prisma.messageJob.update({
    where: { id: jobId },
    data: { status, ...extraData },
  });
}

export async function markJobProcessing(jobId: string) {
  return updateJobStatus(jobId, JobStatus.PROCESSING);
}

export async function markJobSent(jobId: string) {
  return updateJobStatus(jobId, JobStatus.SENT, {
    sentAt: new Date(),
    errorMessage: null,
  });
}

export async function markJobRetry(
  jobId: string,
  retryCount: number,
  errorMessage: string
) {
  return updateJobStatus(jobId, JobStatus.RETRY, {
    retryCount,
    errorMessage,
  });
}

export async function markJobFailed(jobId: string, errorMessage: string) {
  return updateJobStatus(jobId, JobStatus.FAILED, {
    errorMessage,
  });
}
