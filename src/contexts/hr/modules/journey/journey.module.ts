import { Module } from '@nestjs/common';
import { JourneyService } from './journey.service';
import { JourneyController } from './journey.controller';
import { OvertimeService } from './overtime.service';
import { OvertimeController } from './overtime.controller';
import { ParametersModule } from '../parameters/parameters.module';
import { SalaryModule } from '../salary/salary.module';

@Module({
  imports: [ParametersModule, SalaryModule],
  providers: [JourneyService, OvertimeService],
  controllers: [JourneyController, OvertimeController],
  exports: [OvertimeService, JourneyService],
})
export class JourneyModule {}
