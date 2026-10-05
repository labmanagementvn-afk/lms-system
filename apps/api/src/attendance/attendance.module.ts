import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DevicesService } from './devices.service';
import { IdentitiesService } from './identities.service';
import { IngestService } from './ingest.service';
import { ZktecoController } from './zkteco.controller';

@Module({
  controllers: [AttendanceController, ZktecoController],
  providers: [AttendanceService, DevicesService, IdentitiesService, IngestService],
})
export class AttendanceModule {}
