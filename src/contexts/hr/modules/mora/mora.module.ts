import { Module } from '@nestjs/common';
import { MoraService } from './mora.service';
import { MoraController } from './mora.controller';
import { ParametersModule } from '../parameters/parameters.module';

@Module({
  imports: [ParametersModule],
  providers: [MoraService],
  controllers: [MoraController],
  exports: [MoraService],
})
export class MoraModule {}
