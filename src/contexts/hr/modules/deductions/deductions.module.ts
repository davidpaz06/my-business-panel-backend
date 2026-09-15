import { Module } from '@nestjs/common';
import { DeductionsService } from './deductions.service';
import { DeductionsController } from './deductions.controller';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [SalaryModule],
  providers: [DeductionsService],
  controllers: [DeductionsController],
  exports: [DeductionsService],
})
export class DeductionsModule {}
