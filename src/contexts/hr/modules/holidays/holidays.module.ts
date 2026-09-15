import { Module } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { HolidaysController } from './holidays.controller';

@Module({
  providers: [HolidaysService],
  controllers: [HolidaysController],
  exports: [HolidaysService],
})
export class HolidaysModule {}
