-- CreateEnum
CREATE TYPE "DistrictLevel" AS ENUM ('PHONG', 'SO');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('ATTENDANCE_RATE_BELOW', 'LATE_RATE_ABOVE', 'OVERDUE_FEES_ABOVE', 'HEALTH_INCIDENTS_ABOVE', 'ABSENT_STREAK');

-- CreateEnum
CREATE TYPE "MoetExportKind" AS ENUM ('STUDENTS', 'TEACHERS', 'CLASSES', 'TERM_RESULTS');

-- CreateEnum
CREATE TYPE "MoetExportStatus" AS ENUM ('DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'ALERT';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DISTRICT';

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_schoolId_fkey";

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "districtId" TEXT,
ADD COLUMN     "moetCode" TEXT,
ADD COLUMN     "province" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "districtId" TEXT,
ALTER COLUMN "schoolId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "DistrictLevel" NOT NULL DEFAULT 'PHONG',
    "province" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "students" INTEGER NOT NULL DEFAULT 0,
    "present" INTEGER NOT NULL DEFAULT 0,
    "late" INTEGER NOT NULL DEFAULT 0,
    "absent" INTEGER NOT NULL DEFAULT 0,
    "attendanceRate" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "homeroomAbsent" INTEGER NOT NULL DEFAULT 0,
    "invoicesIssued" INTEGER NOT NULL DEFAULT 0,
    "invoicesPaid" INTEGER NOT NULL DEFAULT 0,
    "revenue" BIGINT NOT NULL DEFAULT 0,
    "overdueAmount" BIGINT NOT NULL DEFAULT 0,
    "healthIncidents" INTEGER NOT NULL DEFAULT 0,
    "lmsActiveStudents" INTEGER NOT NULL DEFAULT 0,
    "testsSubmitted" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "districtId" TEXT,
    "kind" "AlertKind" NOT NULL,
    "threshold" DECIMAL(14,2) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "threshold" DECIMAL(14,2) NOT NULL,
    "message" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "districtId" TEXT,
    "userId" TEXT,
    "userRole" "Role",
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "body" JSONB,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoetExport" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" "MoetExportKind" NOT NULL,
    "academicYearId" TEXT,
    "semester" INTEGER,
    "fileId" TEXT,
    "fileName" TEXT NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "status" "MoetExportStatus" NOT NULL DEFAULT 'DONE',
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoetExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "District_code_key" ON "District"("code");

-- CreateIndex
CREATE INDEX "DailyStat_date_idx" ON "DailyStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_schoolId_date_key" ON "DailyStat"("schoolId", "date");

-- CreateIndex
CREATE INDEX "AlertRule_schoolId_idx" ON "AlertRule"("schoolId");

-- CreateIndex
CREATE INDEX "AlertRule_districtId_idx" ON "AlertRule"("districtId");

-- CreateIndex
CREATE INDEX "AlertEvent_schoolId_createdAt_idx" ON "AlertEvent"("schoolId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_ruleId_schoolId_date_key" ON "AlertEvent"("ruleId", "schoolId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "MoetExport_schoolId_createdAt_idx" ON "MoetExport"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "User_districtId_idx" ON "User"("districtId");

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoetExport" ADD CONSTRAINT "MoetExport_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

