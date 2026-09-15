import {
  IsBoolean,
  IsOptional,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Onboarding nested DTOs ──────────────────────────────────────────────────

export class OnboardingBranchDto {
  @IsOptional()
  @IsString()
  branch_name?: string;

  @IsOptional()
  @IsString()
  branch_number?: string;

  @IsOptional()
  @IsString()
  branch_address?: string;
}

export class OnboardingUserDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;

  @IsNotEmpty()
  @IsString()
  first_name!: string;

  @IsNotEmpty()
  @IsString()
  last_name!: string;

  @IsNotEmpty()
  @IsString()
  document_number!: string;

  @IsNotEmpty()
  @IsString()
  phone!: string;
}

export class OnboardingSubscriptionDto {
  /**
   * stripe_payment_method_id es opcional cuando el onboarding usa un
   * special_code: ese flujo salta Stripe por completo. Cuando NO hay
   * código, sigue siendo obligatorio.
   */
  @IsOptional()
  @IsString()
  stripe_payment_method_id?: string;

  @IsNotEmpty()
  @IsString()
  plan!: string;

  @IsNotEmpty()
  @IsNumber()
  payment_method_id!: number;

  @IsNotEmpty()
  @IsNumber()
  payment_amount!: number;

  @IsNotEmpty()
  @IsNumber()
  subscription_type_id!: number;

  @IsNotEmpty()
  @IsDateString()
  start_date!: string;

  @IsNotEmpty()
  @IsDateString()
  end_date!: string;

  /**
   * Si viene presente, el flujo intenta canjear el código en lugar de
   * cobrar por Stripe. La transacción de onboarding lo marca como
   * consumido atómicamente y aborta si está usado o vencido.
   */
  @IsOptional()
  @IsString()
  special_code?: string;
}

// ── Main DTO ────────────────────────────────────────────────────────────────

export class NewTenantDto {
  @IsNotEmpty()
  @IsString()
  tenant_name!: string;

  @IsNotEmpty()
  @IsString()
  contact_email!: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsBoolean()
  is_subscribed?: boolean;

  @IsNotEmpty()
  @IsNumber()
  region_id!: number;

  @IsNotEmpty()
  @IsNumber()
  identification_type_id!: number;

  @IsNotEmpty()
  @IsString()
  identification!: string;

  @IsNotEmpty()
  @IsString()
  economic_activity!: string;

  @IsNotEmpty()
  @IsString()
  sign!: string;

  // ── Onboarding fields (present only for full tenant+subscription flow) ──

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingBranchDto)
  branch?: OnboardingBranchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingUserDto)
  user?: OnboardingUserDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingSubscriptionDto)
  subscription?: OnboardingSubscriptionDto;
}
