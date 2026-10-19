import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @UseGuards(RateLimitGuard)
  @RateLimit('health')
  getHello(): string {
    return this.appService.getHello();
  }
}
