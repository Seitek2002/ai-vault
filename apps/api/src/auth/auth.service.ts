import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto, LoginDto, RefreshDto, UpdateMeDto } from './dto/auth.dto';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const slug = dto.organizationName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
    const org = await this.prisma.organization.create({
      data: { name: dto.organizationName, slug },
    });

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        organizationId: org.id,
        role: 'ADMIN',
      },
    });

    await this.prisma.companySettings.create({
      data: {
        organizationId: org.id,
        name: dto.organizationName,
        inn: '',
        address: '',
      },
    });

    return this.issueTokens(user.id, user.email, user.role, user.organizationId);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user.id, user.email, user.role, user.organizationId);
  }

  async refresh(dto: RefreshDto) {
    const tokenHash = createHash('sha256').update(dto.refreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    return this.issueTokens(user.id, user.email, user.role, user.organizationId);
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    organizationId: string,
  ) {
    const payload: JwtPayload = { sub: userId, email, role, organizationId };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '24h'),
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  async getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (dto.newPassword) {
      if (!dto.currentPassword) throw new UnauthorizedException('Current password is required');
      const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!valid) throw new UnauthorizedException('Incorrect current password');
    }

    const data: { name?: string; passwordHash?: string } = {};
    if (dto.name) data.name = dto.name;
    if (dto.newPassword) data.passwordHash = await argon2.hash(dto.newPassword);

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, name: true, role: true, organizationId: true },
    });
  }
}
