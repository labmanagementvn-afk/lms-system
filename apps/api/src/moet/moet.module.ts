import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { MOET_GATEWAY, moetGatewayFactory } from './moet-gateway';
import { MoetSyncService } from './moet-sync.service';
import { MoetController } from './moet.controller';
import { MoetService } from './moet.service';

/** Trao đổi dữ liệu CSDL ngành GDĐT: MOET-format exports, the student list import and the direct sync. */
@Module({
  imports: [UploadsModule],
  controllers: [MoetController],
  providers: [MoetService, MoetSyncService, { provide: MOET_GATEWAY, useFactory: moetGatewayFactory }],
  exports: [MoetService],
})
export class MoetModule {}
