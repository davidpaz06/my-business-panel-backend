import { IsDateString, IsOptional } from 'class-validator';

export class EnjoyVacationDto {
  @IsDateString()
  enjoyed_from!: string;

  @IsDateString()
  enjoyed_to!: string;
}

export class PayBonusDto {
  @IsOptional()
  @IsDateString()
  paid_at?: string;
}
