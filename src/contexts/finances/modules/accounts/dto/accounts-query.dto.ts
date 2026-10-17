import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

export const ACCOUNT_SORT_FIELDS = ['due_date', 'created_at', 'balance_due'];

// Un valor invalido responde 400 aqui en vez de llegar a Postgres como 500.
export class AccountsOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Solo el superusuario puede pedir un tenant distinto al de su sesion. */
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class AccountListQueryDto extends AccountsOverviewQueryDto {
  @IsOptional()
  @Matches(/^\d+$/, { message: 'status debe ser un id numerico' })
  status?: string;

  @IsOptional()
  @IsIn(ACCOUNT_SORT_FIELDS)
  sort_by?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_dir?: string;
}
