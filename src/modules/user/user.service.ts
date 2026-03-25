import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toPublicUser } from './to-public-user';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  private toSafe(user: User) {
    return toPublicUser(user);
  }

  async create(createUserDto: CreateUserDto) {
    const password = await bcrypt.hash(createUserDto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        password,
        name: createUserDto.name,
        avatarUrl: createUserDto.avatarUrl,
        phone: createUserDto.phone,
        role: createUserDto.role ?? 'user',
        permissions: (createUserDto.permissions ?? []) as Prisma.InputJsonValue,
        isActive: createUserDto.isActive ?? true,
      },
    });
    return this.toSafe(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
    });
    return users.map((u) => this.toSafe(u));
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return this.toSafe(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    await this.ensureExists(id);
    const data: Prisma.UserUpdateInput = {};
    if (updateUserDto.email !== undefined) {
      data.email = updateUserDto.email;
    }
    if (updateUserDto.name !== undefined) {
      data.name = updateUserDto.name;
    }
    if (updateUserDto.avatarUrl !== undefined) {
      data.avatarUrl = updateUserDto.avatarUrl;
    }
    if (updateUserDto.phone !== undefined) {
      data.phone = updateUserDto.phone;
    }
    if (updateUserDto.role !== undefined) {
      data.role = updateUserDto.role;
    }
    if (updateUserDto.isActive !== undefined) {
      data.isActive = updateUserDto.isActive;
    }
    if (updateUserDto.password) {
      data.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    if (updateUserDto.permissions !== undefined) {
      data.permissions = updateUserDto.permissions as Prisma.InputJsonValue;
    }
    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    return this.toSafe(user);
  }

  async remove(id: number) {
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
    return { id };
  }

  private async ensureExists(id: number) {
    const count = await this.prisma.user.count({ where: { id } });
    if (!count) {
      throw new NotFoundException(`User #${id} not found`);
    }
  }
}
