import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDutiesTypeDto {
  /** Solo lo respeta el superusuario; para el resto manda el tenant de la sesion. */
  @IsOptional()
  @IsUUID()
  tenant_id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateDutiesTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
