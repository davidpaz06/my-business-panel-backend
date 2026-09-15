import { Module } from '@nestjs/common';
import { DInvoiceController } from './d-invoice.controller';
import { DInvoiceService } from './d-invoice.service';

@Module({
  controllers: [DInvoiceController],
  providers: [DInvoiceService],
  exports: [DInvoiceService],
})
export class DInvoiceModule {}
