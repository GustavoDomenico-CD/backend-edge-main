import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf((o) => !o.username)
  @IsEmail()
  email?: string;

  @ValidateIf((o) => !o.email)
  @IsString()
  username?: string;

  @IsString()
  @MinLength(1)
  password: string;
}
