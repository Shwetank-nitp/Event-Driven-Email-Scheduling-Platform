import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import prisma from "../config/database";
import { CACHE_TTL, CacheKey, getCache, setCache } from "../config/redis";
import { AppError } from "./errorHandler";

interface AuthTokenPayload extends JwtPayload {
  sub: string;
}

interface CachedAuthUser {
  id: string;
}

const getTokenFromHeader = (req: Request): string => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Unauthorized", 401);
  }
  return authHeader.slice("Bearer ".length).trim();
};

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = getTokenFromHeader(req);
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new AppError("JWT secret is not configured", 500);
    }

    const payload = jwt.verify(token, secret) as AuthTokenPayload;
    if (!payload.sub) {
      throw new AppError("Invalid token payload", 401);
    }

    const cacheKey = CacheKey.authUser(payload.sub);
    const cachedUser = await getCache<CachedAuthUser>(cacheKey);

    if (cachedUser) {
      req.user = { id: cachedUser.id };
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });

    if (!user) {
      throw new AppError("User not found", 401);
    }

    await setCache(cacheKey, { id: user.id }, CACHE_TTL.AUTH_USER);
    req.user = { id: user.id };
    next();
  } catch (error) {
    next(error);
  }
};
