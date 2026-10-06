import { Controller, Inject, UseGuards } from '@nestjs/common';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';
import Stripe from 'stripe';

@UseGuards(AuthenticationGuard)
@Controller('stripe')
export class StripeController {
  constructor(@Inject('STRIPE') private readonly stripe: Stripe) {}

  // ? Configure the subscription payments logic here
}
