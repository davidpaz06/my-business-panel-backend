import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReturnsService } from './returns.service';
import {
  FullRefundDto,
  ReturnTransactionDto,
} from './dto/return_transaction.dto';
import { FindReturnsDto } from './dto/find_returns.dto';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  createReturnTransactionDoc,
  findReturnsDoc,
} from '@/docs/contexts/pos/returns';

// Devoluciones: mueven dinero e inventario. Todo exige sesion y queda acotado
// al tenant de la sesion (la venta se resuelve a traves de su sucursal).
@ApiTags('Returns')
@Controller('returns')
@UseGuards(AuthenticationGuard)
export class ReturnsController {
  constructor(
    private readonly returnsService: ReturnsService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(createReturnTransactionDoc.operation)
  @ApiResponse(createReturnTransactionDoc.responses[201])
  @ApiResponse(createReturnTransactionDoc.responses[500])
  @ApiResponse(createReturnTransactionDoc.responses[401])
  @Post()
  createReturnTransaction(
    @Session() session: IUserSession,
    @Body() req: ReturnTransactionDto,
  ) {
    return this.returnsService.createPartialRefund(
      req,
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(findReturnsDoc.operation)
  @ApiResponse(findReturnsDoc.responses[200])
  @ApiResponse(findReturnsDoc.responses[401])
  @Get()
  findReturns(
    @Session() session: IUserSession,
    @Query() findReturnsDto: FindReturnsDto,
  ) {
    return this.returnsService.findReturns(
      findReturnsDto,
      this.tenantScope.scopeFor(session),
    );
  }

  @Get(':id/detail')
  getReturnDetail(
    @Session() session: IUserSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returnsService.getReturnDetail(
      id,
      this.tenantScope.scopeFor(session),
    );
  }

  /**
   * Get the full refund context (sale + digital + electronic invoices + items)
   * for a given sale_id. Used by the refunds UI to populate fields after
   * the user enters a sale ID.
   */
  @Get('sale/:saleId')
  getSaleRefundContext(
    @Session() session: IUserSession,
    @Param('saleId', ParseUUIDPipe) saleId: string,
  ) {
    return this.returnsService.getSaleRefundContext(
      saleId,
      this.tenantScope.scopeFor(session),
    );
  }

  /**
   * Full refund: marks the sale as refunded and creates a return_transaction.
   * Invoices are preserved; the is_refunded flag on the sale marks it cancelled.
   */
  @Post('sale/:saleId/full-refund')
  processFullRefund(
    @Session() session: IUserSession,
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() body: FullRefundDto,
  ) {
    return this.returnsService.processFullRefund(
      saleId,
      body.description,
      this.tenantScope.scopeFor(session),
    );
  }
}
