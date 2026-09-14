import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const TERMINATION_TYPES = [
  'despido_injustificado',
  'despido_justificado',
  'renuncia',
  'causa_ajena_al_trabajador',
  'vencimiento_contrato',
  'fallecimiento',
] as const;

export class TerminateEmployeeDto {
  @IsDateString()
  termination_date!: string;

  @IsIn(TERMINATION_TYPES)
  termination_type!: (typeof TERMINATION_TYPES)[number];

  @IsOptional()
  @IsString()
  termination_reason?: string;
}

export class UpdateTerminationDto {
  @IsIn(TERMINATION_TYPES)
  termination_type!: (typeof TERMINATION_TYPES)[number];

  @IsOptional()
  @IsString()
  termination_reason?: string;
}
