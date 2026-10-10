-- CreateEnum
CREATE TYPE "PolicyGroup" AS ENUM ('MARTYR_CHILD', 'WAR_INVALID_CHILD', 'POOR_HOUSEHOLD', 'NEAR_POOR_HOUSEHOLD', 'HARDSHIP_AREA', 'DISABILITY', 'ORPHAN');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('ENROLLED', 'TRANSFER_IN', 'CLASS_CHANGE', 'TRANSFER_OUT', 'DROPPED', 'RETURNED');

-- CreateEnum
CREATE TYPE "AwardForm" AS ENUM ('CLASS_PRAISE', 'SCHOOL_PRAISE', 'PRINCIPAL_CERTIFICATE', 'LETTER', 'OTHER');

-- CreateEnum
CREATE TYPE "DisciplineMeasure" AS ENUM ('REMINDER', 'CRITICISM', 'SELF_REVIEW', 'APOLOGY');

-- CreateEnum
CREATE TYPE "AbsenceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'ABSENCE_REQUEST';
ALTER TYPE "NotificationKind" ADD VALUE 'ABSENCE_DECIDED';
ALTER TYPE "NotificationKind" ADD VALUE 'STUDENT_AWARD';
ALTER TYPE "NotificationKind" ADD VALUE 'STUDENT_DISCIPLINE';

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "birthYear" INTEGER,
ADD COLUMN     "idNumber" TEXT,
ADD COLUMN     "occupation" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "currentProvince" TEXT,
ADD COLUMN     "currentWard" TEXT,
ADD COLUMN     "ethnicity" TEXT,
ADD COLUMN     "hometown" TEXT,
ADD COLUMN     "idNumber" TEXT,
ADD COLUMN     "moetCode" TEXT,
ADD COLUMN     "nationality" TEXT DEFAULT 'Việt Nam',
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "permanentProvince" TEXT,
ADD COLUMN     "permanentWard" TEXT,
ADD COLUMN     "policyGroups" "PolicyGroup"[] DEFAULT ARRAY[]::"PolicyGroup"[],
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "youngPioneer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "youthUnion" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StudentMovement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "date" DATE NOT NULL,
    "academicYearId" TEXT,
    "fromClassId" TEXT,
    "toClassId" TEXT,
    "otherSchool" TEXT,
    "reason" TEXT,
    "documentNo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAward" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT,
    "form" "AwardForm" NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "issuer" TEXT,
    "decisionNo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentDiscipline" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT,
    "measure" "DisciplineMeasure" NOT NULL,
    "severity" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "violation" TEXT NOT NULL,
    "support" TEXT,
    "familyConfirmedAt" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbsenceRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "session" "Session",
    "reason" TEXT NOT NULL,
    "status" "AbsenceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbsenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentMovement_schoolId_date_idx" ON "StudentMovement"("schoolId", "date");

-- CreateIndex
CREATE INDEX "StudentMovement_studentId_date_idx" ON "StudentMovement"("studentId", "date");

-- CreateIndex
CREATE INDEX "StudentAward_schoolId_academicYearId_date_idx" ON "StudentAward"("schoolId", "academicYearId", "date");

-- CreateIndex
CREATE INDEX "StudentAward_studentId_idx" ON "StudentAward"("studentId");

-- CreateIndex
CREATE INDEX "StudentDiscipline_schoolId_academicYearId_date_idx" ON "StudentDiscipline"("schoolId", "academicYearId", "date");

-- CreateIndex
CREATE INDEX "StudentDiscipline_studentId_idx" ON "StudentDiscipline"("studentId");

-- CreateIndex
CREATE INDEX "AbsenceRequest_schoolId_status_idx" ON "AbsenceRequest"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AbsenceRequest_classId_fromDate_idx" ON "AbsenceRequest"("classId", "fromDate");

-- CreateIndex
CREATE INDEX "AbsenceRequest_studentId_fromDate_idx" ON "AbsenceRequest"("studentId", "fromDate");

-- AddForeignKey
ALTER TABLE "StudentMovement" ADD CONSTRAINT "StudentMovement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMovement" ADD CONSTRAINT "StudentMovement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMovement" ADD CONSTRAINT "StudentMovement_fromClassId_fkey" FOREIGN KEY ("fromClassId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMovement" ADD CONSTRAINT "StudentMovement_toClassId_fkey" FOREIGN KEY ("toClassId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAward" ADD CONSTRAINT "StudentAward_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAward" ADD CONSTRAINT "StudentAward_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAward" ADD CONSTRAINT "StudentAward_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDiscipline" ADD CONSTRAINT "StudentDiscipline_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDiscipline" ADD CONSTRAINT "StudentDiscipline_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDiscipline" ADD CONSTRAINT "StudentDiscipline_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceRequest" ADD CONSTRAINT "AbsenceRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceRequest" ADD CONSTRAINT "AbsenceRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceRequest" ADD CONSTRAINT "AbsenceRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

