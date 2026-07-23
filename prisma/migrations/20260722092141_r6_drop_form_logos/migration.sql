/*
  Warnings:

  - You are about to drop the column `logo_center_path` on the `forms` table. All the data in the column will be lost.
  - You are about to drop the column `logo_left_path` on the `forms` table. All the data in the column will be lost.
  - You are about to drop the column `logo_right_path` on the `forms` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "forms" DROP COLUMN "logo_center_path",
DROP COLUMN "logo_left_path",
DROP COLUMN "logo_right_path";
