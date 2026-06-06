/*
  Warnings:

  - The values [SEND] on the enum `MessageType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `from_email` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `to_email` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the `email_jobs` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[username]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `from_user` to the `messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `to_user` to the `messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MessageType_new" AS ENUM ('DRAFT', 'INBOX', 'SENT');
ALTER TABLE "messages" ALTER COLUMN "type" TYPE "MessageType_new" USING ("type"::text::"MessageType_new");
ALTER TYPE "MessageType" RENAME TO "MessageType_old";
ALTER TYPE "MessageType_new" RENAME TO "MessageType";
DROP TYPE "public"."MessageType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "email_jobs" DROP CONSTRAINT "email_jobs_user_id_fkey";

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "from_email",
DROP COLUMN "to_email",
ADD COLUMN     "from_user" TEXT NOT NULL,
ADD COLUMN     "to_user" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" TEXT NOT NULL;

-- DropTable
DROP TABLE "email_jobs";

-- CreateTable
CREATE TABLE "message_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failed_job_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failed_job_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_jobs_status_idx" ON "message_jobs"("status");

-- CreateIndex
CREATE INDEX "message_jobs_scheduled_at_idx" ON "message_jobs"("scheduled_at");

-- CreateIndex
CREATE INDEX "message_jobs_status_scheduled_at_idx" ON "message_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "message_jobs_user_id_idx" ON "message_jobs"("user_id");

-- CreateIndex
CREATE INDEX "failed_job_notifications_user_id_idx" ON "failed_job_notifications"("user_id");

-- CreateIndex
CREATE INDEX "failed_job_notifications_is_read_idx" ON "failed_job_notifications"("is_read");

-- CreateIndex
CREATE INDEX "failed_job_notifications_user_id_is_read_idx" ON "failed_job_notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "message_jobs" ADD CONSTRAINT "message_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "failed_job_notifications" ADD CONSTRAINT "failed_job_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
