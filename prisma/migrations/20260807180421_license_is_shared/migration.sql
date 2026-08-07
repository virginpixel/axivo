-- DropForeignKey
ALTER TABLE "forms" DROP CONSTRAINT "forms_company_id_fkey";

-- AlterTable
ALTER TABLE "licenses" ADD COLUMN     "is_shared" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
