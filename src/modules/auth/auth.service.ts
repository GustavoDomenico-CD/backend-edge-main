import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicUser } from '../user/to-public-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private tokenForUser(userId: number) {
    return { access_token: this.jwt.sign({ sub: userId }) };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const password = await bcrypt.hash(dto.password, 10);
    const data: Prisma.UserCreateInput = {
      email: dto.email,
      password,
      name: dto.name,
    };
    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = dto.avatarUrl;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    const user = await this.prisma.user.create({ data });
    return {
      ...this.tokenForUser(user.id),
      user: toPublicUser(user),
    };
  }

  async login(dto: LoginDto) {
    let user: User | null = null;
    if (dto.username) {
      user = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
    }
    if (!user && dto.email) {
      user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
    }
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account disabled');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      ...this.tokenForUser(updated.id),
      user: toPublicUser(updated),
    };
  }
}
