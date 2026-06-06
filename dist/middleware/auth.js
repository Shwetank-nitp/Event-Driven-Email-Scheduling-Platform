"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
const redis_1 = require("../config/redis");
const errorHandler_1 = require("./errorHandler");
const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new errorHandler_1.AppError("Unauthorized", 401);
    }
    return authHeader.slice("Bearer ".length).trim();
};
const requireAuth = async (req, _res, next) => {
    try {
        const token = getTokenFromHeader(req);
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new errorHandler_1.AppError("JWT secret is not configured", 500);
        }
        const payload = jsonwebtoken_1.default.verify(token, secret);
        if (!payload.sub) {
            throw new errorHandler_1.AppError("Invalid token payload", 401);
        }
        const cacheKey = redis_1.CacheKey.authUser(payload.sub);
        const cachedUser = await (0, redis_1.getCache)(cacheKey);
        if (cachedUser) {
            req.user = { id: cachedUser.id };
            next();
            return;
        }
        const user = await database_1.default.user.findUnique({
            where: { id: payload.sub },
            select: { id: true },
        });
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 401);
        }
        await (0, redis_1.setCache)(cacheKey, { id: user.id }, redis_1.CACHE_TTL.AUTH_USER);
        req.user = { id: user.id };
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.requireAuth = requireAuth;
