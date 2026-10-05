import { Global, Module } from '@nestjs/common';
import { TenantScopeService } from './tenant-scope.service';

@Global()
@Module({
  providers: [TenantScopeService],
  exports: [TenantScopeService],
})
export class TenantScopeModule {}
