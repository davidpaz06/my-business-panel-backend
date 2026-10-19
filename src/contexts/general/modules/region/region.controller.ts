import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RegionService } from './region.service';
import { getAllRegionsDoc } from '@/docs/contexts/general/region';
import { RateLimitGuard } from '@/common/rate-limit/rate-limit.guard';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';

@ApiTags('Region')
@Controller('region')
@UseGuards(RateLimitGuard)
@RateLimit('public')
export class RegionController {
  constructor(private readonly regionService: RegionService) {}

  @ApiOperation(getAllRegionsDoc.operation)
  @ApiResponse(getAllRegionsDoc.responses[200])
  @ApiResponse(getAllRegionsDoc.responses[401])
  @Get()
  async getAllRegions() {
    return this.regionService.getAllRegions();
  }
}
