-- AlterTable
ALTER TABLE "TermResult" ADD COLUMN     "academicAfterRetake" "ResultLevel",
ADD COLUMN     "conductAfterTraining" "ResultLevel",
ADD COLUMN     "promotionOverride" "PromotionStatus";

-- CreateTable
CREATE TABLE "SubjectRetake" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "score" DECIMAL(4,1),
    "passed" BOOLEAN,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT,
    "enteredAt" TIMESTAMP(3),

    CONSTRAINT "SubjectRetake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SummerTraining" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tasks" TEXT NOT NULL,
    "result" "ResultLevel",
    "comment" TEXT,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluatedById" TEXT,
    "evaluatedAt" TIMESTAMP(3),

    CONSTRAINT "SummerTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionRound" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "councilDecisionNo" TEXT,
    "councilDecidedOn" DATE,
    "meetingAt" TIMESTAMP(3),
    "meetingPlace" TEXT,
    "members" JSONB NOT NULL DEFAULT '[]',
    "decisionNo" TEXT,
    "decidedOn" DATE,
    "signerTitle" TEXT,
    "signerName" TEXT,
    "recognizedAt" TIMESTAMP(3),
    "recognizedById" TEXT,
    "notRecognized" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletionRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "dossierComplete" BOOLEAN NOT NULL DEFAULT true,
    "priority" TEXT,
    "note" TEXT,
    "roundId" TEXT,
    "registerNo" INTEGER,
    "recognizedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectRetake_schoolId_academicYearId_idx" ON "SubjectRetake"("schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectRetake_studentId_subjectId_academicYearId_key" ON "SubjectRetake"("studentId", "subjectId", "academicYearId");

-- CreateIndex
CREATE INDEX "SummerTraining_schoolId_academicYearId_idx" ON "SummerTraining"("schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "SummerTraining_studentId_academicYearId_key" ON "SummerTraining"("studentId", "academicYearId");

-- CreateIndex
CREATE INDEX "CompletionRound_schoolId_idx" ON "CompletionRound"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "CompletionRound_academicYearId_round_key" ON "CompletionRound"("academicYearId", "round");

-- CreateIndex
CREATE INDEX "CompletionRecord_schoolId_academicYearId_idx" ON "CompletionRecord"("schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "CompletionRecord_studentId_academicYearId_key" ON "CompletionRecord"("studentId", "academicYearId");

-- AddForeignKey
ALTER TABLE "SubjectRetake" ADD CONSTRAINT "SubjectRetake_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectRetake" ADD CONSTRAINT "SubjectRetake_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectRetake" ADD CONSTRAINT "SubjectRetake_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectRetake" ADD CONSTRAINT "SubjectRetake_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummerTraining" ADD CONSTRAINT "SummerTraining_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummerTraining" ADD CONSTRAINT "SummerTraining_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummerTraining" ADD CONSTRAINT "SummerTraining_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionRound" ADD CONSTRAINT "CompletionRound_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionRecord" ADD CONSTRAINT "CompletionRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionRecord" ADD CONSTRAINT "CompletionRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionRecord" ADD CONSTRAINT "CompletionRecord_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionRecord" ADD CONSTRAINT "CompletionRecord_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CompletionRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

