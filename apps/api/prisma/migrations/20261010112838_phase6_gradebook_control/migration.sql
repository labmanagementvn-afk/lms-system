-- CreateEnum
CREATE TYPE "ScoreEditSource" AS ENUM ('MANUAL', 'IMPORT');

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "governingBody" TEXT,
ADD COLUMN     "locality" TEXT,
ADD COLUMN     "principalName" TEXT;

-- AlterTable
ALTER TABLE "SubjectResult" ADD COLUMN     "exempt" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GradeColumnLock" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "subjectId" TEXT,
    "kind" "ScoreKind" NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "lockedById" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeColumnLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeEntryWindow" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "maxEdits" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeEntryWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEdit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" "ScoreKind" NOT NULL,
    "index" INTEGER NOT NULL,
    "oldValue" DECIMAL(4,1),
    "newValue" DECIMAL(4,1),
    "oldPassed" BOOLEAN,
    "newPassed" BOOLEAN,
    "editedById" TEXT NOT NULL,
    "source" "ScoreEditSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectExemption" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectExemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeVisibility" (
    "schoolId" TEXT NOT NULL,
    "regularMarks" BOOLEAN NOT NULL DEFAULT true,
    "examMarks" BOOLEAN NOT NULL DEFAULT true,
    "averages" BOOLEAN NOT NULL DEFAULT true,
    "termResults" BOOLEAN NOT NULL DEFAULT true,
    "titles" BOOLEAN NOT NULL DEFAULT true,
    "absences" BOOLEAN NOT NULL DEFAULT true,
    "homeroomComment" BOOLEAN NOT NULL DEFAULT true,
    "teacherNotes" BOOLEAN NOT NULL DEFAULT true,
    "onlyAfterLock" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeVisibility_pkey" PRIMARY KEY ("schoolId")
);

-- CreateIndex
CREATE INDEX "GradeColumnLock_schoolId_academicYearId_semester_gradeLevel_idx" ON "GradeColumnLock"("schoolId", "academicYearId", "semester", "gradeLevel");

-- CreateIndex
CREATE UNIQUE INDEX "GradeEntryWindow_academicYearId_semester_key" ON "GradeEntryWindow"("academicYearId", "semester");

-- CreateIndex
CREATE INDEX "ScoreEdit_schoolId_academicYearId_semester_idx" ON "ScoreEdit"("schoolId", "academicYearId", "semester");

-- CreateIndex
CREATE INDEX "ScoreEdit_classId_subjectId_semester_idx" ON "ScoreEdit"("classId", "subjectId", "semester");

-- CreateIndex
CREATE INDEX "ScoreEdit_studentId_subjectId_academicYearId_semester_kind__idx" ON "ScoreEdit"("studentId", "subjectId", "academicYearId", "semester", "kind", "index");

-- CreateIndex
CREATE INDEX "SubjectExemption_schoolId_academicYearId_idx" ON "SubjectExemption"("schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectExemption_studentId_subjectId_academicYearId_semeste_key" ON "SubjectExemption"("studentId", "subjectId", "academicYearId", "semester");

-- AddForeignKey
ALTER TABLE "GradeColumnLock" ADD CONSTRAINT "GradeColumnLock_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeColumnLock" ADD CONSTRAINT "GradeColumnLock_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeEntryWindow" ADD CONSTRAINT "GradeEntryWindow_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEdit" ADD CONSTRAINT "ScoreEdit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectExemption" ADD CONSTRAINT "SubjectExemption_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectExemption" ADD CONSTRAINT "SubjectExemption_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectExemption" ADD CONSTRAINT "SubjectExemption_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeVisibility" ADD CONSTRAINT "GradeVisibility_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
