import { Module } from '@nestjs/common';
import { AccountingModule } from '@/contexts/finances/modules/accounting/accounting.module';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';

@Module({
  imports: [AccountingModule],
  providers: [ReturnsService],
  controllers: [ReturnsController],
})
export class ReturnsModule {}
