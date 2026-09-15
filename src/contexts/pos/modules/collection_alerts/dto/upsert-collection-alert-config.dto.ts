import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class UpsertCollectionAlertConfigDto {
  @IsOptional()
  @IsUUID()
  tenant_id?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  warning_days_before_due!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  urgent_days_before_due!: number;

  @Type(() => Boolean)
  @IsBoolean()
  email_notifications_enabled!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  sms_notifications_enabled!: boolean;
}
