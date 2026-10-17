import { Module } from '@nestjs/common';
import { IvaController } from './iva.controller';
import { IvaService } from './iva.service';
import { IvaWithholdingController } from './iva-withholding.controller';
import { IvaWithholdingService } from './iva-withholding.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [IvaController, IvaWithholdingController],
  providers: [IvaService, IvaWithholdingService],
})
export class IvaModule {}
