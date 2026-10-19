import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { CurrencyService } from './currency.service';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';

@ApiBearerAuth()
@ApiTags('Currency')
@Controller('currency')
@UseGuards(AuthenticationGuard, RateLimitGuard)
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
  }
}
