import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import {
  httpRequestDuration,
  httpRequestTotal,
} from "./observability/metrics/app/metrics";

import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import messageRoutes from "./routes/messages";

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import swaggerUi from "swagger-ui-express";
import { logger } from "./utils/logger";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: "Too many requests, please try again later" },
  })
);

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: req.path,
      status_code: String(res.statusCode),
    };
    end(labels);
    httpRequestTotal.inc(labels);
  });
  next();
});

const specs = yaml.load(
  fs.readFileSync(path.join(__dirname, "../openapi.yaml"), "utf-8")
);

if (specs) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(specs));
} else {
  logger.warn("[Docs]: No api specs found at root folder");
}

app.use("/api/auth", authRoutes);
app.use("/api/m", messageRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(errorHandler);

export default app;
