import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(['user', 'paciente', 'admin', 'superadmin'])
  role?: string;

  /** Metadado do fluxo (ex.: chatbot); não há coluna dedicada — aceito para não quebrar o pipe global. */
  @IsOptional()
  @IsString()
  consultationType?: string;

  @IsOptional()
  @IsString()
  consultationCategory?: string;

  /** Legado / UI; o modelo User usa apenas `role` string. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
