import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetEmployeePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  new_password!: string;
}
