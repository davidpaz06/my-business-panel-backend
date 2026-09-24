import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SaleService } from './sale.service';
import { FullSaleDto } from './dto/sales.dto';
import { DATABASE } from '../../../general/modules/db/db.provider';
import Database from '@crane-technologies/database';
import {
  Paginate,
  PaginatedResult,
} from '@/common/decorators/paginator.decorator';
import {
  getSaleConditionsDoc,
  createFullSaleDoc,
  getAllSalesByBranchDoc,
} from '@/docs/contexts/pos/sale';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';

@ApiTags('Sale')
@Controller('sale')
@UseGuards(AuthenticationGuard)
export class SaleController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly saleService: SaleService,
  ) {}

  @ApiOperation(getSaleConditionsDoc.operation)
  @ApiResponse(getSaleConditionsDoc.responses[200])
  @ApiResponse(getSaleConditionsDoc.responses[401])
  @Get()
  getSaleConditions() {
    return this.saleService.getAllConditions();
  }

  @ApiOperation(createFullSaleDoc.operation)
  @ApiResponse(createFullSaleDoc.responses[201])
  @ApiResponse(createFullSaleDoc.responses[400])
  @ApiResponse(createFullSaleDoc.responses[401])
  @Post()
  async createFullSale(@Body() req: FullSaleDto) {
    return this.saleService.createFullSale(req);
  }

  @Get('tenant/all')
  async getAllSalesByTenant(
    @Req() req: any,
    @Query('limit') limit = '100',
    @Query('offset') offset = '0',
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.saleService.getAllSalesByTenant(
      req.user.tenant_id,
      parseInt(limit, 10),
      parseInt(offset, 10),
      dateFrom,
      dateTo,
    );
  }

  @ApiOperation(getAllSalesByBranchDoc.operation)
  @ApiResponse(getAllSalesByBranchDoc.responses[200])
  @ApiResponse(getAllSalesByBranchDoc.responses[401])
  @Get(':branch_id')
  @Paginate({
    table: `(SELECT s.sale_id, s.sale_date, s.total_amount, s.subtotal_amount, s.tax_amount, s.is_completed, s.is_refunded, s.tenant_customer_id, s.created_at, b.branch_id, b.branch_name, c.currency_code, c.symbol,
        (SELECT rt.return_transaction_id FROM pos_schema.return_transaction rt
          INNER JOIN pos_schema.invoice inv ON inv.invoice_id = rt.invoice_id
          WHERE inv.sale_id = s.sale_id LIMIT 1) AS return_transaction_id
        FROM pos_schema.sale s INNER JOIN general_schema.branch b USING(branch_id) INNER JOIN general_schema.currency c USING(currency_id)) AS paginated_sales`,
    columns: [
      'sale_id',
      'sale_date',
      'total_amount',
      'subtotal_amount',
      'tax_amount',
      'is_completed',
      'is_refunded',
      'branch_id',
      'branch_name',
      'currency_code',
      'symbol',
      'tenant_customer_id',
      'created_at',
      'return_transaction_id',
    ],
    pkFields: ['sale_id'],
    whereFields: ['branch_id'],
    dateField: 'sale_date',
  })
  getAllSalesByBranch(
    @Param('branch_id') branch_id: string,
    @PaginatedResult() result: any,
  ) {
    return result;
  }
}
