import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { UserModule } from '../user/user.module';
import { StateModule } from '../state/state.module';
import { SpecialCodeModule } from '../special_code/special_code.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UserModule, StateModule, SpecialCodeModule, AuthModule],
  providers: [TenantService, LevelAuthorizationGuard],
  controllers: [TenantController],
})
export class TenantModule {}
