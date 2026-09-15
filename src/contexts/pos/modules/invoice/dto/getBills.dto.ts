import { IsString } from 'class-validator';

export class getCustomerBillsDto {
  @IsString()
  tenant_id!: string;

  @IsString()
  document_number!: string;
}
