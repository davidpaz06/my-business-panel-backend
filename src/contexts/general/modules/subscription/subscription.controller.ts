import {
  Body,
  Controller,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import { RoleAuthorizationGuard } from '@/common/guards/role_authorization.guard';
import { RequiredRole } from '@/common/decorators/role_metadata.decorator';
import { Session } from '@/common/decorators/session.decorator';
import { IUserSession } from '@/common/interfaces/user_session.interface';
import { TenantScopeService } from '@/common/tenant/tenant-scope.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { NewSubscriptionDto } from './dto/newSubscription.dto';
import { Response } from 'express';
import {
  createSubscriptionDoc,
  handleWebhookDoc,
} from '@/docs/contexts/general/subscription';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @ApiOperation(createSubscriptionDoc.operation)
  @ApiResponse(createSubscriptionDoc.responses[201])
  @ApiResponse(createSubscriptionDoc.responses[400])
  @ApiResponse(createSubscriptionDoc.responses[401])
  // Cobra al cliente de Stripe del tenant: solo admin de ese tenant (o el
  // superusuario de plataforma). El webhook de abajo es publico a proposito
  // (se autentica con la firma de Stripe).
  @UseGuards(AuthenticationGuard, RoleAuthorizationGuard)
  @RequiredRole('superuser', 'admin')
  @Post('create')
  async createSubscription(
    @Session() session: IUserSession,
    @Body() req: NewSubscriptionDto,
  ) {
    req.tenant_id = this.tenantScope.resolveRequestedTenant(
      session,
      req.tenant_id,
    );
    return this.subscriptionService.createSubscription(req);
  }

  @ApiOperation(handleWebhookDoc.operation)
  @ApiResponse(handleWebhookDoc.responses[200])
  @ApiResponse(handleWebhookDoc.responses[400])
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<any>,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    try {
      if (!req.body) {
        return res.status(400).send();
      }
      await this.subscriptionService.handleSubscriptionWebhook(
        req.body,
        signature,
      );
      res.status(200).send('Webhook received');
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(400).send(`Webhook Error: ${error}`);
    }
  }
}
