import prisma from "../config/database";
import { logger } from "../utils/logger";
import { MessageType } from "generated/prisma/client";

export interface MessagePayload {
  subject: string;
  body: string;
}

export class InvalidAddress extends Error {}
export const NO_REQUEUE_EXCEPTION_MESSAGE = "Sender or recipient not found";

export const sendMessage = async (
  senderId: string,
  recipientUsername: string,
  payload: MessagePayload
): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ id: senderId }, { username: recipientUsername }],
      },
    });

    const sender = users.find((u) => u.id === senderId);
    const recipient = users.find((u) => u.username === recipientUsername);

    if (!sender || !recipient) {
      throw new InvalidAddress(NO_REQUEUE_EXCEPTION_MESSAGE);
    }

    await prisma.$transaction([
      // recipient's inbox
      prisma.message.create({
        data: {
          subject: payload.subject,
          body: payload.body,
          toUser: recipient.username,
          fromUser: sender.username,
          type: MessageType.INBOX,
          userId: recipient.id,
        },
      }),
      // sender's sent record
      prisma.message.create({
        data: {
          subject: payload.subject,
          body: payload.body,
          toUser: recipient.username,
          fromUser: sender.username,
          type: MessageType.SENT,
          userId: senderId,
        },
      }),
    ]);
  } catch (err: any) {
    logger.error("[MOCK EMAIL] Failed to deliver message", {
      error: err.message,
      to: recipientUsername,
    });
    throw err; // re-throw so the worker can handle retry logic
  }
};
