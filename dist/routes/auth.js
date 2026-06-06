"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name is required"),
    username: zod_1.z.string().min(3, "Username must be at least 3 characters"),
    email: zod_1.z.string().email("Invalid email"),
    password: zod_1.z.string().min(6, "Password must be at least 6 characters"),
});
const loginSchema = zod_1.z.object({
    identifier: zod_1.z.string().min(1, "Username or email is required"),
    password: zod_1.z.string().min(1, "Password is required"),
});
const signToken = (userId) => {
    const secret = process.env.JWT_SECRET;
    const expiresIn = (process.env.JWT_EXPIRES_IN || "7d");
    if (!secret) {
        throw new errorHandler_1.AppError("JWT secret is not configured", 500);
    }
    const options = {
        subject: userId,
        expiresIn,
    };
    return jsonwebtoken_1.default.sign({}, secret, options);
};
router.post("/register", async (req, res, next) => {
    try {
        const payload = registerSchema.parse(req.body);
        const existingUser = await database_1.default.user.findFirst({
            where: {
                OR: [{ email: payload.email }, { username: payload.username }],
            },
            select: { id: true },
        });
        if (existingUser) {
            throw new errorHandler_1.AppError("Email or username already in use", 409);
        }
        const hashedPassword = await bcryptjs_1.default.hash(payload.password, 10);
        const user = await database_1.default.user.create({
            data: {
                name: payload.name,
                username: payload.username,
                email: payload.email,
                password: hashedPassword,
            },
            select: {
                id: true,
                name: true,
                username: true,
                email: true,
                createdAt: true,
            },
        });
        const token = signToken(user.id);
        res.status(201).json({
            token,
            user,
        });
    }
    catch (error) {
        next(error);
    }
});
router.post("/login", async (req, res, next) => {
    try {
        const payload = loginSchema.parse(req.body);
        const user = await database_1.default.user.findFirst({
            where: {
                OR: [
                    { email: payload.identifier.toLowerCase() },
                    { username: payload.identifier },
                ],
            },
        });
        if (!user) {
            throw new errorHandler_1.AppError("Invalid credentials", 401);
        }
        const passwordMatches = await bcryptjs_1.default.compare(payload.password, user.password);
        if (!passwordMatches) {
            throw new errorHandler_1.AppError("Invalid credentials", 401);
        }
        const token = signToken(user.id);
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
