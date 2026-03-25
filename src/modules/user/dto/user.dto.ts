import { Prisma } from '@prisma/client';

/** API shape for a user (no password). Matches `User` public fields from Prisma. */
export class UserResponseDto {
  id!: number;
  email!: string;
  name!: string | null;
  avatarUrl!: string | null;
  phone!: string | null;
  role!: string;
  permissions!: Prisma.JsonValue;
  isActive!: boolean;
  lastLoginAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export { CreateUserDto } from './create-user.dto';
export { UpdateUserDto } from './update-user.dto';
