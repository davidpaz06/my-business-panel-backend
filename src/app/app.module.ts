import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from '@/app/app.controller';
import { AppService } from '@/app/app.service';

const nodeEnv = process.env.NODE_ENV || 'development';

// General Modules
import { AuthModule } from '@/contexts/general/modules/auth/auth.module';
import { DbModule } from '@/contexts/general/modules/db/db.module';
import { SubscriptionModule } from '@/contexts/general/modules/subscription/subscription.module';
import { CustomerModule } from '@/contexts/general/modules/customer/customer.module';
import { IdentificationTypeModule } from '@/contexts/general/modules/identification-type/identification-type.module';
import { TenantModule } from '@/contexts/general/modules/tenant/tenant.module';
import { ProductCategoryModule } from '@/contexts/general/modules/product_category/product-category.module';
import { CustomerSegmentMarginModule } from '@/contexts/general/modules/customer_segment_margin/customer_segment_margin.module';
import { StripeModule } from '@/contexts/general/modules/stripe/stripe.module';
import { QueueModule } from '@/contexts/general/modules/queue/queue.module';
import { ProductModule } from '@/contexts/general/modules/product/product.module';
import { GlobalAttributeModule } from '@/contexts/general/modules/global_attribute/global-attribute.module';
import { TenantAttributeModule } from '@/contexts/general/modules/tenant_attribute/tenant-attribute.module';
import { AttributeValueModule } from '@/contexts/general/modules/attribute_value/attribute-value.module';
import { ProductCompositionModule } from '@/contexts/general/modules/product_composition/product-composition.module';
import { TenantProductGroupTypeModule } from '@/contexts/general/modules/tenant_product_group_type/tenant-product-group-type.module';
import { TenantProductGroupModule } from '@/contexts/general/modules/tenant_product_group/tenant-product-group.module';
import { ProductVariantGroupAssignmentModule } from '@/contexts/general/modules/product_variant_group_assignment/product-variant-group-assignment.module';
import { CustomerPaymentModule } from '@/contexts/general/modules/customer_payment/customer-payment.module';
import { SegmentModule } from '@/contexts/general/modules/segment/segment.module';
import { BranchModule } from '@/contexts/general/modules/branch/branch.module';
import { RegionModule } from '@/contexts/general/modules/region/region.module';
import { SpecialCodeModule } from '@/contexts/general/modules/special_code/special_code.module';
import { CurrencyModule } from '@/contexts/general/modules/currency/currency.module';
import { ExchangeRateModule } from '@/contexts/general/modules/exchange_rate/exchange-rate.module';

// POS Modules
import { SaleModule } from '@/contexts/pos/modules/sale/sale.module';
import { SaleItemModule } from '@/contexts/pos/modules/sale-item/sale-item.module';
import { InvoiceModule } from '@/contexts/pos/modules/invoice/invoice.module';
import { PromosModule } from '@/contexts/pos/modules/promos/promos.module';
import { ReturnsModule } from '@/contexts/pos/modules/returns/returns.module';
import { CreditDebitNoteModule } from '@/contexts/pos/modules/credit-debit-note/credit-debit-note.module';
import { CashRegisterModule } from '@/contexts/pos/modules/cash_register/cash_register.module';
import { LoyalProgramModule } from '@/contexts/pos/modules/loyal-program/loyalty-program.module';
import { PosExpenseModule } from '@/contexts/pos/modules/pos-expense/pos-expense.module';
import { PosRoyaltyModule } from '@/contexts/pos/modules/pos-royalty/pos-royalty.module';
import { AccountsReceivableModule } from '@/contexts/pos/modules/accounts_receivable/accounts-receivable.module';
import { CollectionAlertsModule } from '@/contexts/pos/modules/collection_alerts/collection-alerts.module';

// PURCHASE Modules
import { PurchaseModule } from '@/contexts/purchase/modules/purchase/purchase.module';
import { SuppliersModule } from '@/contexts/purchase/modules/suppliers/suppliers.module';
import { PaymentAlertsModule } from '@/contexts/purchase/modules/payment_alerts/payment-alerts.module';

// INVENTORY Modules
import { WarehouseModule } from '@/contexts/inventory/modules/warehouse/warehouse.module';

// HR Modules
import { ClockingModule } from '@/contexts/hr/modules/clocking/clocking.module';
import { EmployeeModule } from '@/contexts/hr/modules/employee/employee.module';
import { ContractModule } from '@/contexts/hr/modules/contract/contract.module';
import { ConceptModule } from '@/contexts/hr/modules/concept/concept.module';
import { DutiesTypeModule } from '@/contexts/hr/modules/duties-type/duties-type.module';
import { PayrollModule } from '@/contexts/hr/modules/payroll/payroll.module';
import { FoulModule } from '@/contexts/hr/modules/foul/foul.module';
import { ReportingModule } from '@/contexts/hr/modules/reporting/reporting.module';
import { PaysheetModule } from '@/contexts/hr/modules/paysheet/paysheet.module';
import { PayrollMovementsModule } from '@/contexts/hr/modules/payroll_movements/payroll-movements.module';
import { IncapacityModule } from '@/contexts/hr/modules/incapacity/incapacity.module';
import { ParametersModule } from '@/contexts/hr/modules/parameters/parameters.module';
import { SalaryModule } from '@/contexts/hr/modules/salary/salary.module';
import { HolidaysModule } from '@/contexts/hr/modules/holidays/holidays.module';
import { JourneyModule } from '@/contexts/hr/modules/journey/journey.module';
import { MoraModule } from '@/contexts/hr/modules/mora/mora.module';
import { SeveranceModule } from '@/contexts/hr/modules/severance/severance.module';
import { VacationsModule } from '@/contexts/hr/modules/vacations/vacations.module';
import { ProfitSharingModule } from '@/contexts/hr/modules/profit-sharing/profit-sharing.module';
import { DeductionsModule } from '@/contexts/hr/modules/deductions/deductions.module';
import { BeneficiariesModule } from '@/contexts/hr/modules/beneficiaries/beneficiaries.module';
import { SettlementModule } from '@/contexts/hr/modules/settlement/settlement.module';
import { SuspentionModule } from '@/contexts/hr/modules/suspention/suspention.module';
import { TurnsModule } from '@/contexts/hr/modules/turns/turns.module';
import { TardinessModule } from '@/contexts/hr/modules/tardiness/tardiness.module';

import { AccountingModule } from '@/contexts/finances/modules/accounting/accounting.module';
import { ExpenseModule } from '@/contexts/finances/modules/expense/expense.module';
import { AccountsModule } from '@/contexts/finances/modules/accounts/accounts.module';
import { ProfitabilityModule } from '@/contexts/finances/modules/profitability/profitability.module';
import { LoyaltyModule } from '@/contexts/finances/modules/loyalty/loyalty.module';
import { CashFlowModule } from '@/contexts/finances/modules/cash-flow/cash-flow.module';
import { IvaModule } from '@/contexts/finances/modules/iva/iva.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [`.env.${nodeEnv}`, '.env'],
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    CustomerModule,
    IdentificationTypeModule,
    DbModule,
    QueueModule,
    TenantModule,
    ProductCategoryModule,
    CustomerSegmentMarginModule,
    ProductModule,
    GlobalAttributeModule,
    TenantAttributeModule,
    AttributeValueModule,
    ProductCompositionModule,
    TenantProductGroupTypeModule,
    TenantProductGroupModule,
    ProductVariantGroupAssignmentModule,
    CustomerPaymentModule,
    StripeModule,
    SaleModule,
    SaleItemModule,
    InvoiceModule,
    PromosModule,
    SegmentModule,
    ReturnsModule,
    CreditDebitNoteModule,
    BranchModule,
    CashRegisterModule,
    LoyalProgramModule,
    PosExpenseModule,
    PosRoyaltyModule,
    AccountsReceivableModule,
    CollectionAlertsModule,
    SubscriptionModule,
    ClockingModule,
    EmployeeModule,
    ContractModule,
    ConceptModule,
    DutiesTypeModule,
    ParametersModule,
    SalaryModule,
    HolidaysModule,
    JourneyModule,
    MoraModule,
    SeveranceModule,
    VacationsModule,
    ProfitSharingModule,
    DeductionsModule,
    BeneficiariesModule,
    SettlementModule,
    PayrollMovementsModule,
    PayrollModule,
    PaysheetModule,
    WarehouseModule,
    SuppliersModule,
    PurchaseModule,
    PaymentAlertsModule,
    IncapacityModule,
    SuspentionModule,
    TurnsModule,
    FoulModule,
    TardinessModule,
    RegionModule,
    SpecialCodeModule,
    CurrencyModule,
    ExchangeRateModule,
    AccountingModule,
    ExpenseModule,
    AccountsModule,
    ProfitabilityModule,
    LoyaltyModule,
    CashFlowModule,
    IvaModule,
    ReportingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
