import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { AppError } from "../middleware/errorHandler";
import {
  createUser,
  findUserByUsername,
  findUserForLogin,
} from "../repository/authRepo";

const router = Router();

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(
      /^[A-Za-z]+[A-Za-z0-9]*$/,
      "Username must start with a letter and may contain only letters and numbers"
    ),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

const signToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = (process.env.JWT_EXPIRES_IN ||
    "7d") as jwt.SignOptions["expiresIn"];

  if (!secret) {
    throw new AppError("JWT secret is not configured", 500);
  }

  return jwt.sign({}, secret, {
    subject: userId,
    expiresIn,
  });
};

router.post("/register", async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);

    const username = "@" + payload.username;

    const existingUser = await findUserByUsername(username);

    if (existingUser) {
      throw new AppError("Email or username already in use", 409);
    }

    payload.password = await bcrypt.hash(payload.password, 10);
    payload.username = username;

    const user = await createUser(payload);

    const token = signToken(user.id);

    res.status(201).json({
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);

    const user = await findUserForLogin(payload.identifier);

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const passwordMatches = await bcrypt.compare(
      payload.password,
      user.password
    );

    if (!passwordMatches) {
      throw new AppError("Invalid credentials", 401);
    }

    const token = signToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
