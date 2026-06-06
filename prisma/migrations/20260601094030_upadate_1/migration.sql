/*
  Warnings:

  - The values [SENT,SCHEDULED] on the enum `MessageType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `recipient` on the `messages` table. All the data in the column will be lost.
  - Added the required column `from_email` to the `messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `to_email` to the `messages` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MessageType_new" AS ENUM ('DRAFT', 'INBOX', 'SEND');
ALTER TABLE "messages" ALTER COLUMN "type" TYPE "MessageType_new" USING ("type"::text::"MessageType_new");
ALTER TYPE "MessageType" RENAME TO "MessageType_old";
ALTER TYPE "MessageType_new" RENAME TO "MessageType";
DROP TYPE "public"."MessageType_old";
COMMIT;

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "recipient",
ADD COLUMN     "from_email" TEXT NOT NULL,
ADD COLUMN     "to_email" TEXT NOT NULL;
