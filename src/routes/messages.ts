import { Router } from "express";
import { JobStatus } from "generated/prisma/client";
import {
  CACHE_TTL,
  CacheKey,
  deleteCache,
  deleteCacheByPattern,
  getCache,
  setCache,
} from "../config/redis";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { z } from "zod";
import {
  cancelJob,
  createJob,
  getJobById,
  getJobStats,
  getMessageById,
  getMessageStats,
  getPaginatedDraft,
  getPaginatedInbox,
  getPaginatedJobs,
  getPaginatedSent,
} from "../repository/messageRepo";

const router = Router();

export const createJobSchema = z.object({
  recipient: z.string("recipient must be a valid username"),
  subject: z.string().min(1, "subject is required"),
  body: z.string().min(1, "body is required"),
  scheduledAt: z.coerce.date(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const messageTypeSchema = z.object({
  type: z.enum(["jobs", "inbox", "sent", "draft"]).default("jobs"),
});

export const statsTypeSchema = z.object({
  type: z.enum(["job", "message"]).default("job"),
});

router.use(requireAuth);

router.post("/schedule", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const payload = createJobSchema.parse(req.body);

    const job = await createJob(userId, payload);
    await deleteCacheByPattern(CacheKey.messageListPattern(userId));
    await deleteCache(CacheKey.stats(userId, "job"));

    res.status(201).json(job);
  } catch (error) {
    next(error);
  }
});

router.get("/messages", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const { page, limit } = paginationSchema.parse(req.query);
    const { type } = messageTypeSchema.parse(req.query);

    const skip = (page - 1) * limit;

    const cacheKey = CacheKey.messageList(userId, type, page, limit);

    const cached = await getCache<{
      data: unknown[];
      total: number;
    }>(cacheKey);

    if (cached) {
      return res.json({
        ...cached,
        page,
        limit,
        cached: true,
      });
    }

    const handlers = {
      jobs: getPaginatedJobs,
      sent: getPaginatedSent,
      draft: getPaginatedDraft,
      inbox: getPaginatedInbox,
    } as const;

    const [data, total] = await handlers[type](limit, userId, skip);

    const payload = {
      data,
      total,
    };

    await setCache(cacheKey, payload, CACHE_TTL.USER_JOBS);

    res.json({
      ...payload,
      page,
      limit,
      cached: false,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/messages/:id", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const { type } = messageTypeSchema.parse(req.query);
    const messageId = req.params.id;
    const cacheKey = CacheKey.message(messageId, type);

    const cached = await getCache<{ userId: string }>(cacheKey);
    if (cached && cached.userId === userId) {
      res.json({ ...cached, cached: true });
      return;
    }

    const handlers = {
      jobs: getJobById,
      sent: getMessageById,
      draft: getMessageById,
      inbox: getMessageById,
    } as const;

    const message = await handlers[type](messageId);
    if (!message || message.userId !== userId) {
      throw new AppError("Message not found", 404);
    }

    await setCache(cacheKey, message, CACHE_TTL.JOB_METADATA);
    res.json({ ...message, cached: false });
  } catch (error) {
    next(error);
  }
});

router.get("/stats", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const { type } = statsTypeSchema.parse(req.query);
    const cacheKey = CacheKey.stats(userId, type);

    const cached = await getCache<Record<string, number>>(cacheKey);
    if (cached) {
      res.json({ stats: cached, cached: true });
      return;
    }

    let stats: Record<string, number>;

    if (type === "job") {
      const grouped = await getJobStats(userId);
      stats = grouped.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<string, number>);
    } else {
      const grouped = await getMessageStats(userId);
      stats = grouped.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<string, number>);
    }

    await setCache(cacheKey, stats, CACHE_TTL.JOB_STATS);
    res.json({ stats, cached: false });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/cancel", async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Unauthorized", 401);

    const job = await getJobById(req.params.id);
    if (!job || job.userId !== userId) {
      throw new AppError("Job not found", 404);
    }

    if (job.status !== JobStatus.PENDING) {
      throw new AppError("Only pending jobs can be cancelled", 409);
    }

    const updated = await cancelJob(job.id);

    await deleteCache(CacheKey.job(job.id), CacheKey.stats(userId, "job"));
    await deleteCacheByPattern(CacheKey.messageListPattern(userId));

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
