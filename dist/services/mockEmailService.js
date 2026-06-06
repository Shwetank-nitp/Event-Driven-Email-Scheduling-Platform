"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = exports.NO_REQUEUE_EXCEPTION_MESSAGE = exports.InvalidAddress = void 0;
const database_1 = __importDefault(require("../config/database"));
const logger_1 = require("../utils/logger");
const client_1 = require("../../generated/prisma/client");
class InvalidAddress extends Error {
}
exports.InvalidAddress = InvalidAddress;
exports.NO_REQUEUE_EXCEPTION_MESSAGE = "Sender or recipient not found";
// ─── Core ─────────────────────────────────────────────────────────────────────
const sendMessage = async (senderId, // user ID of sender
recipientId, // user ID of the recipient
payload) => {
    try {
        const users = await database_1.default.user.findMany({
            where: {
                id: {
                    in: [senderId, recipientId],
                },
            },
        });
        const sender = users.find((u) => u.id === senderId);
        const recipient = users.find((u) => u.id === recipientId);
        if (!sender || !recipient) {
            throw new InvalidAddress(exports.NO_REQUEUE_EXCEPTION_MESSAGE);
        }
        await database_1.default.$transaction([
            // recipient's inbox
            database_1.default.message.create({
                data: {
                    subject: payload.subject,
                    body: payload.body,
                    toUser: recipient.username,
                    fromUser: sender.username,
                    type: client_1.MessageType.INBOX,
                    userId: recipientId,
                },
            }),
            // sender's sent record
            database_1.default.message.create({
                data: {
                    subject: payload.subject,
                    body: payload.body,
                    toUser: recipient.username,
                    fromUser: sender.username,
                    type: client_1.MessageType.DRAFT,
                    userId: senderId,
                },
            }),
        ]);
        logger_1.logger.info("[MOCK EMAIL] Message delivered to inbox", {
            to: sender.username,
            subject: payload.subject,
        });
    }
    catch (err) {
        logger_1.logger.error("[MOCK EMAIL] Failed to deliver message", {
            error: err.message,
            to: recipientId,
        });
        throw err; // re-throw so the worker can handle retry logic
    }
};
exports.sendMessage = sendMessage;
