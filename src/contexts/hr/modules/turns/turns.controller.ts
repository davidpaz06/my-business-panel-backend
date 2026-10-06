import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TurnsService } from './turns.service';
import { RegisterTurnDto, UpdateTurnDto } from './dto/create_turn.dto';
import {
  createTurnDoc,
  getTurnsByBranchDoc,
  updateTurnDoc,
  deleteTurnDoc,
} from '@/docs/contexts/hr/turns';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';

@ApiTags('Turns')
@Controller('turns')
@UseGuards(AuthenticationGuard)
export class TurnsController {
  constructor(
    private readonly turnsService: TurnsService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(createTurnDoc.operation)
  @ApiResponse(createTurnDoc.responses[201])
  @ApiResponse(createTurnDoc.responses[400])
  @ApiResponse(createTurnDoc.responses[401])
  @Post()
  async createTurn(
    @Session() session: IUserSession,
    @Body() body: RegisterTurnDto,
  ) {
    await this.tenantScope.assertOwns('branch', body.branchId, session);
    return this.turnsService.createNewTurn(body);
  }

  @ApiOperation(getTurnsByBranchDoc.operation)
  @ApiResponse(getTurnsByBranchDoc.responses[200])
  @ApiResponse(getTurnsByBranchDoc.responses[401])
  @Get('/branch/:branchId')
  async getTurnsByBranch(
    @Session() session: IUserSession,
    @Param('branchId') branchId: string,
  ) {
    await this.tenantScope.assertOwns('branch', branchId, session);
    return this.turnsService.getTurnsByBranch(branchId);
  }

  @ApiOperation(updateTurnDoc.operation)
  @ApiResponse(updateTurnDoc.responses[200])
  @ApiResponse(updateTurnDoc.responses[401])
  @Patch('/:turnId')
  async updateTurn(
    @Session() session: IUserSession,
    @Param('turnId') turnId: number,
    @Body() body: UpdateTurnDto,
  ) {
    await this.tenantScope.assertOwns('turn', turnId, session);
    if (body.branchId)
      await this.tenantScope.assertOwns('branch', body.branchId, session);
    return this.turnsService.updateTurn(turnId, body);
  }

  @ApiOperation(deleteTurnDoc.operation)
  @ApiResponse(deleteTurnDoc.responses[200])
  @ApiResponse(deleteTurnDoc.responses[401])
  @Delete('/:turnId')
  async deleteTurn(
    @Session() session: IUserSession,
    @Param('turnId') turnId: number,
  ) {
    await this.tenantScope.assertOwns('turn', turnId, session);
    return this.turnsService.deleteTurn(turnId);
  }
}
