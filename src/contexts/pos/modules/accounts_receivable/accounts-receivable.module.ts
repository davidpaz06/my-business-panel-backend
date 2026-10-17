import { Module } from '@nestjs/common';
import { AccountsReceivableService } from './accounts-receivable.service';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { WarehouseModule } from '@/contexts/inventory/modules/warehouse/warehouse.module';
import { AccountingModule } from '@/contexts/finances/modules/accounting/accounting.module';

@Module({
  imports: [WarehouseModule, AccountingModule],
  controllers: [AccountsReceivableController],
  providers: [AccountsReceivableService],
})
export class AccountsReceivableModule {}
