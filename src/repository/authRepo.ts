// repository/userRepo.ts
import prisma from "../config/database";
import { z } from "zod";
import { registerSchema } from "../routes/auth";

export async function findUserByUsername(username: string) {
  return prisma.user.findFirst({
    where: { username },
    select: { id: true },
  });
}

export async function createUser(data: z.infer<typeof registerSchema>) {
  return prisma.user.create({
    data: {
      name: data.name,
      username: data.username,
      password: data.password,
    },
    select: { id: true, name: true, username: true, createdAt: true },
  });
}

export async function findUserForLogin(username: string) {
  return prisma.user.findFirst({
    where: { username },
  });
}
