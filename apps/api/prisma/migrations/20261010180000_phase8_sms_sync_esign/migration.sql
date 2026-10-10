-- CreateEnum
CREATE TYPE "SmsAudience" AS ENUM ('PARENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "SmsCampaignStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MoetTarget" AS ENUM ('MOET', 'PROVINCE');

-- CreateEnum
CREATE TYPE "MoetSyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SignatureProvider" AS ENUM ('VNPT_SMARTCA', 'VIETTEL_MYSIGN');

-- CreateEnum
CREATE TYPE "ERecordKind" AS ENUM ('HOC_BA');

-- CreateEnum
CREATE TYPE "ERecordStatus" AS ENUM ('DRAFT', 'HOMEROOM_SIGNED', 'ISSUED', 'REVOKED');

-- CreateTable
CREATE TABLE "SmsSetting" (
    "schoolId" TEXT NOT NULL,
    "brandname" TEXT,
    "classMonthlyQuota" INTEGER NOT NULL DEFAULT 200,
    "schoolMonthlyQuota" INTEGER NOT NULL DEFAULT 500,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSetting_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "SmsClassQuota" (
    "classId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "monthlyLimit" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsClassQuota_pkey" PRIMARY KEY ("classId")
);

-- CreateTable
CREATE TABLE "SmsTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" "SmsAudience" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsCampaign" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "audience" "SmsAudience" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "accented" BOOLEAN NOT NULL DEFAULT false,
    "scope" JSONB NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "SmsCampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "segments" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "SmsCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "studentId" TEXT,
    "classId" TEXT,
    "teacherId" TEXT,
    "body" TEXT NOT NULL,
    "segments" INTEGER NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalRef" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoetSync" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "target" "MoetTarget" NOT NULL,
    "kind" "MoetExportKind" NOT NULL,
    "academicYearId" TEXT,
    "semester" INTEGER,
    "username" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "MoetSyncStatus" NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "externalRef" TEXT,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MoetSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureProfile" (
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "provider" "SignatureProvider" NOT NULL,
    "account" TEXT NOT NULL,
    "certSerial" TEXT NOT NULL,
    "certSubject" TEXT NOT NULL,
    "certIssuer" TEXT NOT NULL,
    "certValidFrom" TIMESTAMP(3) NOT NULL,
    "certValidTo" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ERecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" "ERecordKind" NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ERecordStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "signatures" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "ERecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsClassQuota_schoolId_idx" ON "SmsClassQuota"("schoolId");

-- CreateIndex
CREATE INDEX "SmsTemplate_schoolId_idx" ON "SmsTemplate"("schoolId");

-- CreateIndex
CREATE INDEX "SmsCampaign_schoolId_scheduledAt_idx" ON "SmsCampaign"("schoolId", "scheduledAt");

-- CreateIndex
CREATE INDEX "SmsCampaign_status_scheduledAt_idx" ON "SmsCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SmsMessage_campaignId_idx" ON "SmsMessage"("campaignId");

-- CreateIndex
CREATE INDEX "SmsMessage_status_nextAttemptAt_idx" ON "SmsMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SmsMessage_schoolId_classId_idx" ON "SmsMessage"("schoolId", "classId");

-- CreateIndex
CREATE INDEX "MoetSync_schoolId_startedAt_idx" ON "MoetSync"("schoolId", "startedAt");

-- CreateIndex
CREATE INDEX "SignatureProfile_schoolId_idx" ON "SignatureProfile"("schoolId");

-- CreateIndex
CREATE INDEX "ERecord_schoolId_academicYearId_classId_idx" ON "ERecord"("schoolId", "academicYearId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "ERecord_studentId_academicYearId_kind_version_key" ON "ERecord"("studentId", "academicYearId", "kind", "version");

-- AddForeignKey
ALTER TABLE "SmsSetting" ADD CONSTRAINT "SmsSetting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsClassQuota" ADD CONSTRAINT "SmsClassQuota_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsTemplate" ADD CONSTRAINT "SmsTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsCampaign" ADD CONSTRAINT "SmsCampaign_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SmsCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoetSync" ADD CONSTRAINT "MoetSync_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureProfile" ADD CONSTRAINT "SignatureProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERecord" ADD CONSTRAINT "ERecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERecord" ADD CONSTRAINT "ERecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

