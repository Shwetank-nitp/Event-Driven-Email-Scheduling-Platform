/*
  Warnings:

  - You are about to drop the column `max_retries` on the `message_jobs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "message_jobs" DROP COLUMN "max_retries";
