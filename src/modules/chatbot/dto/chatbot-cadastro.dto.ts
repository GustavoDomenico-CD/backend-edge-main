import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Payload mínimo para cadastro via chatbot (evita corpos HTTP enormes).
 * Roles/permissões herdadas não entram no body; o usuário é criado como `paciente`.
 */
export class ChatbotCadastroDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  consultationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  consultationCategory?: string;
}
