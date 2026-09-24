import { IsUUID } from 'class-validator';

export class ApplySupplierCreditDto {
  @IsUUID()
  purchase_account_payable_id!: string;
}
