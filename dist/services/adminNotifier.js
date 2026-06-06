"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyAdminFailure = exports.getNotifier = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("../utils/logger");
class EmailNotifier {
    constructor() {
        const host = process.env.SMTP_HOST;
        const port = parseInt(process.env.SMTP_PORT || "587");
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        const secure = process.env.SMTP_SECURE === "true";
        this.fromEmail = process.env.SMTP_FROM || "no-reply@scheduler.local";
        this.adminEmail = process.env.ADMIN_ALERT_EMAIL || "";
        if (!host || !user || !pass || !this.adminEmail) {
            throw new Error("Missing SMTP/Admin alert configuration. Set SMTP_HOST, SMTP_USER, SMTP_PASS and ADMIN_ALERT_EMAIL.");
        }
        this.transporter = nodemailer_1.default.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
        });
    }
    async notifyFailure(event) {
        await this.transporter.sendMail({
            from: this.fromEmail,
            to: this.adminEmail,
            subject: `[Scheduler][FAILED] Message job ${event.jobId}`,
            text: [
                "A message delivery job has permanently failed.",
                "",
                `Job ID: ${event.jobId}`,
                `User ID: ${event.userId}`,
                `Recipient: ${event.recipient}`,
                `Subject: ${event.subject}`,
                `Retry Count: ${event.retryCount}`,
                `Failed At: ${event.failedAt}`,
                `Error: ${event.errorMessage}`,
            ].join("\n"),
        });
    }
}
let notifier = null;
const getNotifier = () => {
    if (!notifier) {
        notifier = new EmailNotifier();
    }
    return notifier;
};
exports.getNotifier = getNotifier;
const notifyAdminFailure = async (event) => {
    try {
        await (0, exports.getNotifier)().notifyFailure(event);
        logger_1.logger.info("Admin failure alert sent", { jobId: event.jobId });
    }
    catch (err) {
        logger_1.logger.error("Failed to send admin failure alert", {
            jobId: event.jobId,
            error: err.message,
        });
        throw err;
    }
};
exports.notifyAdminFailure = notifyAdminFailure;
