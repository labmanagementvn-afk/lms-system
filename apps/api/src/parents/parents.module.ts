import { Global, Module } from '@nestjs/common';
import { CanteenModule } from '../canteen/canteen.module';
import { FinanceModule } from '../finance/finance.module';
import { HealthModule } from '../health/health.module';
import { ParentAccessService } from './parent-access.service';
import { ParentAccountsController, ParentController } from './parents.controller';
import { ParentsService } from './parents.service';

/** Global so any module can check which children a parent may see. */
@Global()
@Module({
  imports: [FinanceModule, HealthModule, CanteenModule],
  controllers: [ParentAccountsController, ParentController],
  providers: [ParentAccessService, ParentsService],
  exports: [ParentAccessService],
})
export class ParentsModule {}
