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

app.use("/api/auth", authRoutes);
app.use("/api/m", messageRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(errorHandler);

export default app;
