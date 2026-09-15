-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "fk_refresh_user";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "failed_login_count",
DROP COLUMN "locked_until",
DROP COLUMN "password_hash",
ADD COLUMN     "auth_id" UUID;

-- DropTable
DROP TABLE "refresh_tokens";

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_auth_id" ON "users"("auth_id");

