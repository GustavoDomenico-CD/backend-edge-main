import { IsString, IsOptional, IsBoolean, IsInt, IsObject, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class ProactiveButtonDto {
  @IsString()
  label: string

  @IsString()
  value: string
}

export class CreateProactiveRuleDto {
  @IsInt()
  userId: number

  @IsString()
  trigger: 'interval' | 'event' | 'schedule'

  @IsObject()
  condition: Record<string, unknown>

  @IsString()
  message: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProactiveButtonDto)
  buttons?: ProactiveButtonDto[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class UpdateProactiveRuleDto {
  @IsOptional()
  @IsString()
  trigger?: 'interval' | 'event' | 'schedule'

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>

  @IsOptional()
  @IsString()
  message?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProactiveButtonDto)
  buttons?: ProactiveButtonDto[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
