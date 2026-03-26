import { IsString, IsOptional, IsBoolean, IsInt, IsObject } from 'class-validator'

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
  @IsBoolean()
  isActive?: boolean
}
