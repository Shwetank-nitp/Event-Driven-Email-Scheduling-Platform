import { PrismaClient } from "generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { logger } from "../utils/logger";
import { execSync } from "child_process";

const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: "event", level: "query" },
    { emit: "event", level: "error" },
  ],
});

prisma.$on("error", (e) => {
  logger.error("Prisma error", { message: e.message });
});

export const connectDB = async (): Promise<void> => {
  await prisma.$connect();
  logger.info("PostgreSQL connected via Prisma");
};

export const runMigrations = async (): Promise<void> => {
  try {
    logger.info("Running Prisma migrations...");

    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
    });

    logger.info("Prisma migrations completed");
  } catch (error) {
    logger.error("Migration failed", { error });
    process.exit(1);
  }
};

export default prisma;
