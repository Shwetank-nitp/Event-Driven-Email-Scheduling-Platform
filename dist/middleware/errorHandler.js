"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.AppError = void 0;
const zod_1 = require("zod");
const logger_1 = require("../utils/logger");
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.AppError = AppError;
const errorHandler = (err, _req, res, _next) => {
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            error: "Validation failed",
            details: err.flatten(),
        });
        return;
    }
    if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    logger_1.logger.error("Unhandled server error", { error: message });
    res.status(500).json({ error: "Internal server error" });
};
exports.errorHandler = errorHandler;
