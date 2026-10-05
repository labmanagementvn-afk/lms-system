import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years';
import { ConductController, ConductCriteriaController, ParentConductController, StudentConductController } from './conduct.controller';
import { ConductService } from './conduct.service';
import { CriteriaService } from './criteria.service';

/** Rèn luyện: conduct criteria, self-assessment, homeroom review and leadership approval. */
@Module({
  imports: [AcademicYearsModule],
  controllers: [ConductCriteriaController, ConductController, StudentConductController, ParentConductController],
  providers: [CriteriaService, ConductService],
  exports: [ConductService, CriteriaService],
})
export class ConductModule {}
