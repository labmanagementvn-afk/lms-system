import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StatsModule } from '../stats/stats.module';
import { DistrictController, SchoolSettingsController } from './district.controller';
import { DistrictService } from './district.service';

/** Phòng / Sở GD&ĐT: district officer accounts, cross-school dashboards and the school's district settings. */
@Module({
  imports: [StatsModule, AuditModule],
  controllers: [SchoolSettingsController, DistrictController],
  providers: [DistrictService],
  exports: [DistrictService],
})
export class DistrictModule {}
