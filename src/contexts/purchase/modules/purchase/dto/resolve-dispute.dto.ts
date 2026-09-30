import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveDisputeDto {
  @ApiProperty({ description: 'Notas de resolucion de la disputa.' })
  @IsString()
  @IsNotEmpty()
  resolution_notes!: string;
}
