import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';

// NotificationsService comes from the global NotificationsModule.
@Module({ controllers: [HrController], providers: [HrService], exports: [HrService] })
export class HrModule {}
