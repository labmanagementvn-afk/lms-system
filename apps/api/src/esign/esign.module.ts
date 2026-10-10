import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { ERecordsController, PublicERecordsController, SignaturesController } from './esign.controller';
import { ERecordsService } from './erecords.service';
import { SIGNATURE_PROVIDERS, signatureAdaptersFactory } from './signature-provider';
import { SignaturesService } from './signatures.service';

/** Chữ ký số and học bạ số: remote signing accounts and transcripts signed by the homeroom teacher and the principal. */
@Module({
  imports: [ReportsModule],
  controllers: [SignaturesController, ERecordsController, PublicERecordsController],
  providers: [SignaturesService, ERecordsService, { provide: SIGNATURE_PROVIDERS, useFactory: signatureAdaptersFactory }],
})
export class EsignModule {}
