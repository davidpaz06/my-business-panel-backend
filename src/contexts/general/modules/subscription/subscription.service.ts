import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE } from '../db/db.provider';
import Database from '@resonance-components/datahandler';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { NewSubscriptionDto } from './dto/newSubscription.dto';
import { generalQueries } from '@general/general.queries';
import { SignatureVerificationError } from '@/common/errors/signature_verification.error';
import { VerifyPaymentException } from '@/common/errors/verify_payment.dto';

const { subscriptions, tenant } = generalQueries;

@Injectable()
export class SubscriptionService {
  private readonly webhookSecret: string;
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject('STRIPE') private readonly stripe: Stripe,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.webhookSecret = secret;
  }

  private readonly tiers = {
    standard: process.env.STANDARD,
    test: process.env.TEST,
    premium: process.env.PREMIUM,
  } as const;

  async createSubscription(data: NewSubscriptionDto) {
    const {
      tenant_id,
      payment_method_id,
      payment_amount,
      details,
      stripe_payment_method_id,
      plan,
      start_date,
      end_date,
      subscription_type_id,
    } = data;

    const priceId =
      this.tiers[`${plan.toLowerCase()}` as keyof typeof this.tiers];

    let tenantStripeId: string;
    let shouldPersistStripeId = false;
    let stripeSubscriptionIdToCompensate: string | null = null;
    const tenantPaymentId = randomUUID();

    try {
      // Verificacion de que el tenant exista y ya sea un customer en Stripe
      const tenantResult = await this.db.query(tenant.byId, [tenant_id]);

      if (tenantResult.rows.length === 0) {
        throw new NotFoundException('Tenant not found');
      }

      const tenantInfo = tenantResult.rows[0];

      if (tenantInfo.stripe_id && tenantInfo.stripe_id !== null) {
        tenantStripeId = tenantInfo.stripe_id;
      } else {
        const newCustomer = await this.stripe.customers.create({
          email: tenantInfo.contact_email,
          name: tenantInfo.tenant_name,
          metadata: { tenant_id },
        });

        tenantStripeId = newCustomer.id;
        shouldPersistStripeId = true;
      }

      // Adjuntar el payment method de Stripe al customer
      await this.stripe.paymentMethods.attach(stripe_payment_method_id, {
        customer: tenantStripeId,
      });
      await this.stripe.customers.update(tenantStripeId, {
        invoice_settings: { default_payment_method: stripe_payment_method_id },
      });

      // Crear la subscripcion en Stripe
      const subscription = await this.stripe.subscriptions.create({
        customer: tenantStripeId,
        items: [{ price: priceId }],
        default_payment_method: stripe_payment_method_id,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        metadata: { tenantPaymentId, tenantId: tenant_id },
        expand: ['latest_invoice.confirmation_secret'],
      });

      stripeSubscriptionIdToCompensate = subscription.id;

      const invoice = subscription.latest_invoice as Stripe.Invoice;

      if (!invoice) {
        throw new Error('No invoice found on subscription');
      }

      const clientSecret = invoice.confirmation_secret?.client_secret ?? null;

      if (!clientSecret) {
        throw new Error('Could not obtain payment client_secret from Stripe');
      }

      const txn = await this.db.transaction();
      let committed = false;

      try {
        if (shouldPersistStripeId) {
          await txn.query(tenant.updateStripeId, [tenantStripeId, tenant_id]);
        }

        await txn.rawQuery(
          `INSERT INTO general_schema.tenant_payment
             (tenant_payment_id, tenant_id, payment_method_id, payment_amount, details)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            tenantPaymentId,
            tenant_id,
            payment_method_id,
            payment_amount,
            details,
          ],
        );

        const newSub = await txn.query(subscriptions.createSubscription, [
          tenant_id,
          subscription_type_id,
          tenantPaymentId,
          start_date,
          end_date,
        ]);

        await txn.commit();
        committed = true;

        return {
          idOnDb: newSub.rows[0].subscription_id,
          subscriptionId: subscription.id,
          clientSecret,
          invoice: invoice.id,
          status: subscription.status,
        };
      } catch (error) {
        if (!committed) {
          try {
            await txn.rollback();
          } catch (rollbackError) {
            console.error(
              '[SubscriptionService.createSubscription] Rollback failed:',
              rollbackError,
            );
          }
        }
        throw error;
      }
    } catch (error) {
      if (stripeSubscriptionIdToCompensate) {
        try {
          await this.stripe.subscriptions.cancel(
            stripeSubscriptionIdToCompensate,
          );
        } catch (compensationError) {
          console.error(
            '[SubscriptionService.createSubscription] Stripe compensation failed:',
            compensationError,
          );
        }
      }
      throw error;
    }
  }

  async handleSubscriptionWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error(
          'Error verifying Stripe webhook signature:',
          error.message,
        );
      } else {
        console.error('Unknown error verifying Stripe webhook signature');
      }
      throw new SignatureVerificationError('Invalid signature');
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string;
      };

      const subscription = await this.stripe.subscriptions.retrieve(
        invoice.subscription as string,
      );

      const tenantPaymentId = subscription.metadata.tenantPaymentId;

      try {
        await this.db.query('CALL verify_tenant_payment($1)', [
          tenantPaymentId,
        ]);
      } catch (error) {
        if (error instanceof Error) {
          console.error(
            `Error verifying tenant payment ${tenantPaymentId}:`,
            error.message,
          );
        } else {
          console.error(
            `Unknown error verifying tenant payment ${tenantPaymentId}`,
          );
        }
        throw new VerifyPaymentException(tenantPaymentId);
      }
    }

    if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object;
      const tenantId = subscription.metadata.tenantId;

      if (!tenantId) {
        throw new NotFoundException(
          'Tenant ID not found in subscription metadata',
        );
      }
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const tenantId = subscription.metadata.tenantId;

      if (!tenantId) {
        throw new NotFoundException(
          'Tenant ID not found in subscription metadata',
        );
      }

      if (
        subscription.cancel_at_period_end === true &&
        subscription.status === 'active'
      ) {
        await this.db.query(subscriptions.cancelSubscription, [tenantId]);
        return { received: true };
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const tenantId = subscription.metadata.tenantId;

      if (!tenantId) {
        throw new NotFoundException(
          'Tenant ID not found in subscription metadata',
        );
      }

      await this.db.query(subscriptions.cancelSubscription, [tenantId]);
    }

    return { received: true };
  }
}
