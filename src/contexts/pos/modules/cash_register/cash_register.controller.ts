import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CashRegisterService } from './cash_register.service';
import { CreateCashRegisterDto } from './dto/create_cash_register.dto';
import { UpdateCashRegisterDto } from './dto/update_cash_register.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { UseGuards } from '@nestjs/common';
import { LevelAuthorizationGuard } from '@/common/guards/level_authorization.guard';
import { RequiredLevel } from '@/common/decorators/level_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { StartCashRegisterSessionDto } from './dto/start_cash_register_session.dto';
import { CloseCashRegisterSessionDto } from './dto/close_cash_register_session.dto';
import {
  createCashRegisterDoc,
  findCashRegistersDoc,
  startCashRegisterSessionDoc,
  closeCashRegisterSessionDoc,
  findOneCashRegisterDoc,
  updateCashRegisterDoc,
  removeCashRegisterDoc,
} from '@/docs/contexts/pos/cash_register';

@ApiTags('Cash Register')
@UseGuards(AuthenticationGuard, LevelAuthorizationGuard)
@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly cashRegisterService: CashRegisterService) {}

  @ApiOperation(createCashRegisterDoc.operation)
  @ApiResponse(createCashRegisterDoc.responses[201])
  @ApiResponse(createCashRegisterDoc.responses[400])
  @ApiResponse(createCashRegisterDoc.responses[401])
  @RequiredLevel(3)
  @Post()
  create(
    @Body() createCashRegisterDto: CreateCashRegisterDto,
    @Session() session: IUserSession,
  ) {
    return this.cashRegisterService.create(
      session.tenant_id,
      createCashRegisterDto,
    );
  }

  @ApiOperation(findCashRegistersDoc.operation)
  @ApiResponse(findCashRegistersDoc.responses[200])
  @ApiResponse(findCashRegistersDoc.responses[401])
  @RequiredLevel(1)
  @Get()
  find(
    @Session() session: IUserSession,
    @Query() query: { branch_id?: string },
  ) {
    return query.branch_id
      ? this.cashRegisterService.findByBranch(session, query.branch_id)
      : this.cashRegisterService.findAll(session);
  }

  @RequiredLevel(1)
  @Get('all/paginated')
  findPaginated(
    @Session() session: IUserSession,
    @Query('branch_id') branchId?: string,
    @Query('is_active') isActive?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const isActiveParam =
      isActive === undefined || isActive === ''
        ? undefined
        : isActive === 'true';
    return this.cashRegisterService.findAllPaginated(
      session,
      branchId || undefined,
      isActiveParam,
      parseInt(page),
      parseInt(limit),
    );
  }

  @RequiredLevel(1)
  @Get('sessions/all')
  findSessions(
    @Session() session: IUserSession,
    @Query() query: { branch_id?: string; is_active?: string },
  ) {
    const isActive =
      query.is_active === undefined || query.is_active === ''
        ? undefined
        : query.is_active === 'true';
    return this.cashRegisterService.findSessions(
      session.tenant_id,
      query.branch_id,
      isActive,
    );
  }

  @ApiOperation(startCashRegisterSessionDoc.operation)
  @ApiResponse(startCashRegisterSessionDoc.responses[201])
  @ApiResponse(startCashRegisterSessionDoc.responses[401])
  @ApiResponse(startCashRegisterSessionDoc.responses[404])
  @RequiredLevel(1)
  @Post('start')
  startSession(
    @Session() session: IUserSession,
    @Body() startSessionDto: StartCashRegisterSessionDto,
  ) {
    return this.cashRegisterService.startSession(session, startSessionDto);
  }

  @ApiOperation(closeCashRegisterSessionDoc.operation)
  @ApiResponse(closeCashRegisterSessionDoc.responses[201])
  @ApiResponse(closeCashRegisterSessionDoc.responses[400])
  @ApiResponse(closeCashRegisterSessionDoc.responses[401])
  @ApiResponse(closeCashRegisterSessionDoc.responses[404])
  @RequiredLevel(1)
  @Post('close')
  closeSession(
    @Session() session: IUserSession,
    @Body() closeSessionDto: CloseCashRegisterSessionDto,
  ) {
    return this.cashRegisterService.closeSession(session, closeSessionDto);
  }

  @RequiredLevel(1)
  @Get('sessions/:sessionId/report')
  getSessionReport(
    @Session() session: IUserSession,
    @Param('sessionId') sessionId: string,
  ) {
    return this.cashRegisterService.getSessionReport(session, sessionId);
  }

  @RequiredLevel(1)
  @Get('sessions/:sessionId/payment-methods')
  getPaymentMethods(
    @Session() session: IUserSession,
    @Param('sessionId') sessionId: string,
  ) {
    return this.cashRegisterService.getSessionPaymentMethods(
      session,
      sessionId,
    );
  }

  @ApiOperation(findOneCashRegisterDoc.operation)
  @ApiResponse(findOneCashRegisterDoc.responses[200])
  @ApiResponse(findOneCashRegisterDoc.responses[401])
  @RequiredLevel(1)
  @Get(':id')
  findOne(@Session() session: IUserSession, @Param('id') id: string) {
    return this.cashRegisterService.findById(session, id);
  }

  @ApiOperation(updateCashRegisterDoc.operation)
  @ApiResponse(updateCashRegisterDoc.responses[200])
  @ApiResponse(updateCashRegisterDoc.responses[401])
  @RequiredLevel(3)
  @Put(':id')
  update(
    @Session() session: IUserSession,
    @Body() updateCashRegisterDto: UpdateCashRegisterDto,
  ) {
    return this.cashRegisterService.update(session, updateCashRegisterDto);
  }

  @ApiOperation(removeCashRegisterDoc.operation)
  @ApiResponse(removeCashRegisterDoc.responses[200])
  @ApiResponse(removeCashRegisterDoc.responses[401])
  @RequiredLevel(4)
  @Delete(':id')
  remove(@Session() session: IUserSession, @Param('id') id: string) {
    return this.cashRegisterService.remove(session, id);
  }
}
