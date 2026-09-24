import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveDisputeDto {
  @ApiProperty({ description: 'Notas de resolucion de la discrepancia.' })
  @IsNotEmpty()
  resolution_notes!: string;
}
