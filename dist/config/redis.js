"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCacheByPattern = exports.deleteCache = exports.setCache = exports.getCache = exports.CacheKey = exports.CACHE_TTL = exports.connectRedis = exports.redisSubscriber = exports.redisClient = void 0;
// src/config/redis.ts
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("../utils/logger");
// --- Client Factory ---
const createRedisClient = (name) => {
    const client = new ioredis_1.default({
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || "0"),
        retryStrategy: (times) => {
            if (times > 10) {
                logger_1.logger.error(`Redis [${name}] max retries reached`);
                return null; // stop retrying
            }
            const delay = Math.min(times * 100, 3000);
            logger_1.logger.warn(`Redis [${name}] retrying in ${delay}ms (attempt ${times})`);
            return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
    });
    client.on("connect", () => logger_1.logger.info(`Redis [${name}] connected`));
    client.on("ready", () => logger_1.logger.info(`Redis [${name}] ready`));
    client.on("error", (err) => logger_1.logger.error(`Redis [${name}] error`, { error: err.message }));
    client.on("close", () => logger_1.logger.warn(`Redis [${name}] connection closed`));
    client.on("reconnecting", () => logger_1.logger.warn(`Redis [${name}] reconnecting...`));
    return client;
};
// --- Separate clients for different concerns ---
exports.redisClient = createRedisClient("default"); // general caching
exports.redisSubscriber = createRedisClient("subscriber"); // reserved for pub/sub if needed
// --- Connect ---
const connectRedis = async () => {
    await exports.redisClient.connect();
    logger_1.logger.info("Redis connected successfully");
};
exports.connectRedis = connectRedis;
// --- TTL Constants (in seconds) ---
exports.CACHE_TTL = {
    JOB_METADATA: 300, // 5 min  — single job details
    USER_JOBS: 60, // 1 min  — paginated job list
    JOB_STATS: 120, // 2 min  — status counts per user
    AUTH_USER: 600, // 10 min — cached user session data
};
// --- Cache Key Builders ---
exports.CacheKey = {
    job: (id) => `job:${id}`,
    userJobs: (userId, page) => `user:${userId}:jobs:page:${page}`,
    jobStats: (userId) => `user:${userId}:stats`,
    authUser: (userId) => `auth:user:${userId}`,
};
// --- Generic Helpers ---
const getCache = async (key) => {
    const data = await exports.redisClient.get(key);
    if (!data)
        return null;
    return JSON.parse(data);
};
exports.getCache = getCache;
const setCache = async (key, value, ttl) => {
    await exports.redisClient.setex(key, ttl, JSON.stringify(value));
};
exports.setCache = setCache;
const deleteCache = async (...keys) => {
    if (keys.length)
        await exports.redisClient.del(...keys);
};
exports.deleteCache = deleteCache;
const deleteCacheByPattern = async (pattern) => {
    const keys = await exports.redisClient.keys(pattern);
    if (keys.length)
        await exports.redisClient.del(...keys);
};
exports.deleteCacheByPattern = deleteCacheByPattern;
exports.default = exports.redisClient;
