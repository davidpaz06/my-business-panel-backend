import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { ApiTags } from '@nestjs/swagger';
import { GlobalAttributeService } from './global-attribute.service';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';

@ApiTags('Global Attribute')
@UseGuards(AuthenticationGuard, RateLimitGuard)
@Controller('global-attribute')
export class GlobalAttributeController {
  constructor(private readonly service: GlobalAttributeService) {}

  @Get()
  async getAll() {
    return this.service.getAll();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.service.getById(id);
  }
}
