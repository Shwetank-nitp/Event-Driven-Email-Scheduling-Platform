"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../../generated/prisma/client");
const database_1 = __importDefault(require("../config/database"));
const redis_1 = require("../config/redis");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const createJobSchema = zod_1.z.object({
    recipient: zod_1.z.string().uuid("recipient must be a valid user id"),
    subject: zod_1.z.string().min(1, "subject is required"),
    body: zod_1.z.string().min(1, "body is required"),
    scheduledAt: zod_1.z.coerce.date(),
});
const paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(10),
});
router.use(auth_1.requireAuth);
router.post("/schedule", async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            throw new errorHandler_1.AppError("Unauthorized", 401);
        const payload = createJobSchema.parse(req.body);
        const job = await database_1.default.messageJob.create({
            data: {
                userId,
                recipient: payload.recipient,
                subject: payload.subject,
                body: payload.body,
                scheduledAt: payload.scheduledAt,
                status: client_1.JobStatus.PENDING,
            },
        });
        await (0, redis_1.deleteCacheByPattern)(`user:${userId}:jobs:*`);
        await (0, redis_1.deleteCache)(redis_1.CacheKey.jobStats(userId));
        res.status(201).json(job);
    }
    catch (error) {
        next(error);
    }
});
router.get("/jobs", async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            throw new errorHandler_1.AppError("Unauthorized", 401);
        const { page, limit } = paginationSchema.parse(req.query);
        const skip = (page - 1) * limit;
        const cacheKey = redis_1.CacheKey.userJobs(userId, page);
        const cached = await (0, redis_1.getCache)(cacheKey);
        if (cached) {
            res.json({ ...cached, page, limit, cached: true });
            return;
        }
        const [jobs, total] = await Promise.all([
            database_1.default.messageJob.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            database_1.default.messageJob.count({ where: { userId } }),
        ]);
        const payload = { jobs, total };
        await (0, redis_1.setCache)(cacheKey, payload, redis_1.CACHE_TTL.USER_JOBS);
        res.json({ ...payload, page, limit, cached: false });
    }
    catch (error) {
        next(error);
    }
});
router.get("/jobs/:id", async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            throw new errorHandler_1.AppError("Unauthorized", 401);
        const jobId = req.params.id;
        const cacheKey = redis_1.CacheKey.job(jobId);
        const cached = await (0, redis_1.getCache)(cacheKey);
        if (cached && cached.userId === userId) {
            res.json({ ...cached, cached: true });
            return;
        }
        const job = await database_1.default.messageJob.findUnique({ where: { id: jobId } });
        if (!job || job.userId !== userId) {
            throw new errorHandler_1.AppError("Job not found", 404);
        }
        await (0, redis_1.setCache)(cacheKey, job, redis_1.CACHE_TTL.JOB_METADATA);
        res.json({ ...job, cached: false });
    }
    catch (error) {
        next(error);
    }
});
router.get("/stats", async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            throw new errorHandler_1.AppError("Unauthorized", 401);
        const cacheKey = redis_1.CacheKey.jobStats(userId);
        const cached = await (0, redis_1.getCache)(cacheKey);
        if (cached) {
            res.json({ stats: cached, cached: true });
            return;
        }
        const grouped = await database_1.default.messageJob.groupBy({
            by: ["status"],
            where: { userId },
            _count: { status: true },
        });
        const stats = grouped.reduce((acc, item) => {
            acc[item.status] = item._count.status;
            return acc;
        }, {});
        await (0, redis_1.setCache)(cacheKey, stats, redis_1.CACHE_TTL.JOB_STATS);
        res.json({ stats, cached: false });
    }
    catch (error) {
        next(error);
    }
});
router.post("/jobs/:id/cancel", async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            throw new errorHandler_1.AppError("Unauthorized", 401);
        const job = await database_1.default.messageJob.findUnique({ where: { id: req.params.id } });
        if (!job || job.userId !== userId) {
            throw new errorHandler_1.AppError("Job not found", 404);
        }
        if (job.status !== client_1.JobStatus.PENDING) {
            throw new errorHandler_1.AppError("Only pending jobs can be cancelled", 409);
        }
        const updated = await database_1.default.messageJob.update({
            where: { id: job.id },
            data: { status: client_1.JobStatus.CANCELLED },
        });
        await (0, redis_1.deleteCache)(redis_1.CacheKey.job(job.id), redis_1.CacheKey.jobStats(userId));
        await (0, redis_1.deleteCacheByPattern)(`user:${userId}:jobs:*`);
        res.json(updated);
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
