import { IsString, IsOptional, IsBoolean, IsArray, IsIn, IsNumber } from 'class-validator';

export class SendTextMessageDto {
  @IsString()
  to: string;

  @IsString()
  text: string;
}

export class SendTemplateMessageDto {
  @IsString()
  to: string;

  @IsString()
  templateName: string;

  @IsString()
  languageCode: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}

export class SendMediaMessageDto {
  @IsString()
  to: string;

  @IsIn(['image', 'document', 'audio', 'video'])
  type: 'image' | 'document' | 'audio' | 'video';

  @IsString()
  mediaUrl: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
  filename?: string;
}

export class UpsertContactDto {
  @IsString()
  phoneNumber: string;

  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsString()
  language: string;

  @IsString()
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ListMessagesQueryDto {
  @IsNumber()
  @IsOptional()
  contactId?: number;

  @IsString()
  @IsOptional()
  direction?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  per_page?: string;
}
