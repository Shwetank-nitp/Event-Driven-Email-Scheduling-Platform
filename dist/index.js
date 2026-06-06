"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const database_1 = require("./config/database");
const rabbitmq_1 = require("./config/rabbitmq");
const redis_1 = require("./config/redis");
const metrics_1 = require("./config/metrics");
const cronScheduler_1 = require("./workers/cronScheduler");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = __importDefault(require("./routes/auth"));
const messages_1 = __importDefault(require("./routes/messages"));
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "3000");
const METRICS_PORT = parseInt(process.env.METRICS_PORT || "9090");
// --- Security & Parsing ---
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// --- Rate Limiting ---
app.use("/api", (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: "Too many requests, please try again later" },
}));
// --- Request Metrics Middleware ---
app.use((req, res, next) => {
    const end = metrics_1.httpRequestDuration.startTimer();
    res.on("finish", () => {
        const labels = {
            method: req.method,
            route: req.path,
            status_code: String(res.statusCode),
        };
        end(labels);
        metrics_1.httpRequestTotal.inc(labels);
    });
    next();
});
// --- Routes ---
app.use("/api/auth", auth_1.default);
app.use("/api/messages", messages_1.default);
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// --- Error Handler ---
app.use(errorHandler_1.errorHandler);
// --- Metrics Server (separate port for Prometheus scraping) ---
const metricsApp = (0, express_1.default)();
metricsApp.get("/metrics", async (_req, res) => {
    res.set("Content-Type", metrics_1.registry.contentType);
    res.end(await metrics_1.registry.metrics());
});
// --- Bootstrap ---
const bootstrap = async () => {
    await (0, database_1.connectDB)();
    await (0, database_1.runMigrations)();
    await (0, rabbitmq_1.connectRabbitMQ)();
    await (0, redis_1.connectRedis)();
    (0, cronScheduler_1.startCronScheduler)();
    app.listen(PORT, () => logger_1.logger.info(`API server running on port ${PORT}`));
    metricsApp.listen(METRICS_PORT, () => logger_1.logger.info(`Metrics server running on port ${METRICS_PORT}`));
};
process.on("SIGTERM", async () => {
    logger_1.logger.info("SIGTERM received, shutting down");
    await (0, rabbitmq_1.closeRabbitMQ)();
    process.exit(0);
});
bootstrap().catch((err) => {
    logger_1.logger.error("Failed to start server", err);
    process.exit(1);
});
exports.default = app;
