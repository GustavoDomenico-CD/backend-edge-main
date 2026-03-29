import { User } from '@prisma/client';
import { UserResponseDto } from './dto/user.dto';

export function toPublicUser(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    role: user.role,
    permissions: user.permissions,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
