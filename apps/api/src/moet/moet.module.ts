import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { MoetController } from './moet.controller';
import { MoetService } from './moet.service';

/** Trao đổi dữ liệu CSDL ngành GDĐT: MOET-format exports and the student list import. */
@Module({
  imports: [UploadsModule],
  controllers: [MoetController],
  providers: [MoetService],
  exports: [MoetService],
})
export class MoetModule {}
