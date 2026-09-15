import { PartialType } from '@nestjs/mapped-types';
import { NewBillDto } from './newBill.dto';

export class UpdateBill extends PartialType(NewBillDto) {}
