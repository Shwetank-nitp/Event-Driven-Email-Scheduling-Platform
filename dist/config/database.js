"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = exports.connectDB = void 0;
const client_1 = require("../../generated/prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const logger_1 = require("../utils/logger");
const child_process_1 = require("child_process");
const connectionString = process.env.DATABASE_URL;
const adapter = new adapter_pg_1.PrismaPg({ connectionString });
const prisma = new client_1.PrismaClient({
    adapter,
    log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "error" },
    ],
});
prisma.$on("error", (e) => {
    logger_1.logger.error("Prisma error", { message: e.message });
});
const connectDB = async () => {
    await prisma.$connect();
    logger_1.logger.info("PostgreSQL connected via Prisma");
};
exports.connectDB = connectDB;
const runMigrations = async () => {
    try {
        logger_1.logger.info("Running Prisma migrations...");
        (0, child_process_1.execSync)("npx prisma migrate deploy", {
            stdio: "inherit",
        });
        logger_1.logger.info("Prisma migrations completed");
    }
    catch (error) {
        logger_1.logger.error("Migration failed", { error });
        process.exit(1);
    }
};
exports.runMigrations = runMigrations;
exports.default = prisma;
