import Redis from "ioredis";
import { logger } from "../utils/logger";

const createRedisClient = (name: string): Redis => {
  const client = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || "0"),
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error(`Redis [${name}] max retries reached`);
        return null; // stop retrying
      }
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis [${name}] retrying in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  client.on("connect", () => logger.info(`Redis [${name}] connected`));
  client.on("ready", () => logger.info(`Redis [${name}] ready`));
  client.on("error", (err) =>
    logger.error(`Redis [${name}] error`, { error: err.message })
  );
  client.on("close", () => logger.warn(`Redis [${name}] connection closed`));
  client.on("reconnecting", () =>
    logger.warn(`Redis [${name}] reconnecting...`)
  );

  return client;
};

export const redisClient = createRedisClient("default"); // general caching
export const redisSubscriber = createRedisClient("subscriber"); // reserved for pub/sub if needed

export const connectRedis = async (): Promise<void> => {
  await redisClient.connect();
  logger.info("Redis connected successfully");
};

export const CACHE_TTL = {
  JOB_METADATA: 300, // 5 min  — single job details
  USER_JOBS: 60, // 1 min  — paginated job list
  JOB_STATS: 120, // 2 min  — status counts per user
  AUTH_USER: 600, // 10 min — cached user session data
} as const;

export const CacheKey = {
  job: (id: string) => `job:${id}`,

  messageList: (
    userId: string,
    type: "jobs" | "inbox" | "sent" | "draft",
    page: number,
    limit: number
  ) => `user:${userId}:messages:${type}:page:${page}:limit:${limit}`,

  messageListPattern: (userId: string) => `user:${userId}:messages:*`,

  authUser: (userId: string) => `auth:user:${userId}`,

  message: (id: string, type: string) => `message:${type}:${id}`,

  stats: (userId: string, type: "job" | "message") =>
    `user:${userId}:stats:${type}`,
} as const;

export const getCache = async <T>(key: string): Promise<T | null> => {
  const data = await redisClient.get(key);
  if (!data) return null;
  return JSON.parse(data) as T;
};

export const setCache = async (
  key: string,
  value: unknown,
  ttl: number
): Promise<void> => {
  await redisClient.setex(key, ttl, JSON.stringify(value));
};

export const deleteCache = async (...keys: string[]): Promise<void> => {
  if (keys.length) await redisClient.del(...keys);
};

export const deleteCacheByPattern = async (pattern: string): Promise<void> => {
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redisClient.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      100
    );

    cursor = nextCursor;

    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } while (cursor !== "0");
};

export default redisClient;
