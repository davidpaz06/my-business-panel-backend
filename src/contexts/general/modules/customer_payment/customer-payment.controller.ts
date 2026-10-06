import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CustomerPaymentService } from '@/contexts/general/modules/customer_payment/customer-payment.service';
import { NewCustomerPaymentDto, testdto } from './dto/NewCustomerPayment.dto';
import {
  getAllPaymentsDoc,
  getCustomerPaymentsDoc,
  newPaymentDoc,
  bulkInsertPaymentsDoc,
  deleteCustomerPaymentDoc,
} from '@/docs/contexts/general/customer_payment';

// Aislamiento por tenant: los pagos se listan y operan solo dentro del tenant
// de la sesion; ventas, clientes y pagos ajenos responden 404.
@ApiTags('Customer Payment')
@UseGuards(AuthenticationGuard)
@Controller('payment')
export class CustomerPaymentController {
  constructor(
    private readonly paymentsService: CustomerPaymentService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(getAllPaymentsDoc.operation)
  @ApiResponse(getAllPaymentsDoc.responses[200])
  @ApiResponse(getAllPaymentsDoc.responses[401])
  @Get()
  async getAllPayments(@Session() session: IUserSession) {
    return this.paymentsService.getEveryPayment(
      this.tenantScope.scopeFor(session),
    );
  }

  @ApiOperation(getCustomerPaymentsDoc.operation)
  @ApiResponse(getCustomerPaymentsDoc.responses[200])
  @ApiResponse(getCustomerPaymentsDoc.responses[401])
  @ApiResponse(getCustomerPaymentsDoc.responses[404])
  @Get(':id')
  async getCustomerPayments(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    await this.tenantScope.assertOwns('customer', id, session);
    return this.paymentsService.getCustomerPayments(id);
  }

  @ApiOperation(newPaymentDoc.operation)
  @ApiResponse(newPaymentDoc.responses[201])
  @ApiResponse(newPaymentDoc.responses[400])
  @ApiResponse(newPaymentDoc.responses[401])
  @Post()
  async newPayment(
    @Session() session: IUserSession,
    @Body() req: NewCustomerPaymentDto,
  ) {
    if (req.sale_id) {
      await this.tenantScope.assertOwns('sale', req.sale_id, session);
    }
    if (req.tenant_customer_id) {
      await this.tenantScope.assertOwns(
        'customer',
        req.tenant_customer_id,
        session,
      );
    }
    return this.paymentsService.createCustomerPayment(req);
  }

  @ApiOperation(bulkInsertPaymentsDoc.operation)
  @ApiResponse(bulkInsertPaymentsDoc.responses[201])
  @ApiResponse(bulkInsertPaymentsDoc.responses[400])
  @ApiResponse(bulkInsertPaymentsDoc.responses[401])
  @Post('bulk')
  async bulkInsert(@Session() session: IUserSession, @Body() req: testdto) {
    await this.tenantScope.assertOwns('sale', req.sale_id, session);
    for (const payment of req.payments ?? []) {
      if (payment.tenant_customer_id) {
        await this.tenantScope.assertOwns(
          'customer',
          payment.tenant_customer_id,
          session,
        );
      }
    }
    return this.paymentsService.bulkInsert(req.payments, req.sale_id);
  }

  @ApiOperation(deleteCustomerPaymentDoc.operation)
  @ApiResponse(deleteCustomerPaymentDoc.responses[200])
  @ApiResponse(deleteCustomerPaymentDoc.responses[401])
  @ApiResponse(deleteCustomerPaymentDoc.responses[404])
  @Delete(':id')
  async deleteCustomerPayment(
    @Session() session: IUserSession,
    @Param('id') id: string,
  ) {
    await this.tenantScope.assertOwns('customerPayment', id, session);
    return this.paymentsService.deleteCustomerPayment(id);
  }
}
