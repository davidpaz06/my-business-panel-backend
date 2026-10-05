import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

// El tenant del programa NO viaja en el body: se toma de la sesion.
export class NewLoyalProgramDto {
  @IsNumber()
  points_earned_per_currency_unit!: number;

  @IsNumber()
  points_redeemed_per_currency_unit!: number;

  @IsOptional()
  @IsNumber()
  minimum_purchase_for_points?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
