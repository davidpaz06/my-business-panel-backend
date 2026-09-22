import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BeneficiariesService } from './beneficiaries.service';
import {
  CreateBeneficiaryDto,
  ValidateBeneficiaryDto,
  DistributeSettlementDto,
} from './dto/beneficiary.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';

@ApiTags('Beneficiaries')
@Controller('beneficiaries')
@UseGuards(AuthenticationGuard)
export class BeneficiariesController {
  constructor(private readonly service: BeneficiariesService) {}

  @Post()
  create(@Body() body: CreateBeneficiaryDto, @Session() user: IUserSession) {
    return this.service.create(user.tenant_id, body);
  }

  @Post(':beneficiaryId/validate')
  validate(
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() body: ValidateBeneficiaryDto,
    @Session() user: IUserSession,
  ) {
    return this.service.validate(user.tenant_id, beneficiaryId, body);
  }

  @Get(':employeeId/claim-window')
  claimWindow(
    @Param('employeeId') employeeId: string,
    @Session() user: IUserSession,
  ) {
    return this.service.claimWindow(user.tenant_id, employeeId);
  }

  @Post(':employeeId/distribute')
  distribute(
    @Param('employeeId') employeeId: string,
    @Body() body: DistributeSettlementDto,
    @Session() user: IUserSession,
  ) {
    return this.service.distribute(user.tenant_id, employeeId, body);
  }

  @Get(':employeeId')
  list(
    @Param('employeeId') employeeId: string,
    @Query('onlyValidated') onlyValidated: string,
    @Session() user: IUserSession,
  ) {
    return this.service.list(
      user.tenant_id,
      employeeId,
      onlyValidated === undefined ? undefined : onlyValidated === 'true',
    );
  }
}
