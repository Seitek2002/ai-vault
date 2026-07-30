import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { randomUUID } from 'crypto';
import type {
  RegisterDto,
  LoginDto,
  RefreshDto,
  UpdateMeDto,
  AddMemberDto,
  CreateMemberDto,
  UpdateMemberDto,
  CreateOrganizationDto,
} from './dto/auth.dto';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

/** Full "me" projection — reused across getMe/updateMe/avatar+background+sidebar uploads. */
const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  organizationId: true,
  avatarUrl: true,
  backgroundId: true,
  backgroundImageUrl: true,
  backgroundFilter: true,
  backgroundImageScope: true,
  sidebarBackgroundId: true,
  sidebarImageUrl: true,
  sidebarImageFilter: true,
  position: { select: { id: true, name: true, permissions: true } },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private storage: StorageService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);

    // Organization is optional at signup — an unattached account can create
    // or join one later from Settings.
    if (!dto.organizationName) {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          organizationId: null,
          role: 'MANAGER',
        },
      });
      return this.issueTokens(user.id, user.email, user.role, user.organizationId);
    }

    const org = await this.createOrganizationRecord(dto.organizationName);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        organizationId: org.id,
        role: 'ADMIN',
      },
    });

    return this.issueTokens(user.id, user.email, user.role, user.organizationId);
  }

  private async createOrganizationRecord(name: string) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
    const org = await this.prisma.organization.create({ data: { name, slug } });
    await this.prisma.companySettings.create({
      data: { organizationId: org.id, name, inn: '', address: '' },
    });
    return org;
  }

  /** For an unattached account: creates a new organization and makes the caller its admin. */
  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.organizationId) {
      throw new ConflictException('You already belong to an organization');
    }

    const org = await this.createOrganizationRecord(dto.name);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id, role: 'ADMIN' },
    });

    return this.issueTokens(updated.id, updated.email, updated.role, updated.organizationId);
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
    organizationId: string | null,
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
      select: ME_SELECT,
    });
  }

  /** Lists every user in the caller's organization (team roster). */
  async listMembers(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        avatarUrl: true,
        position: { select: { id: true, name: true, permissions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Assigns a position and/or role to an existing member of the caller's organization. */
  async updateMember(organizationId: string, memberId: string, dto: UpdateMemberDto) {
    const member = await this.prisma.user.findFirst({ where: { id: memberId, organizationId } });
    if (!member) throw new NotFoundException('Member not found in your organization');

    if (dto.positionId) {
      const position = await this.prisma.position.findFirst({
        where: { id: dto.positionId, organizationId },
      });
      if (!position) throw new NotFoundException('Position not found');
    }

    return this.prisma.user.update({
      where: { id: memberId },
      data: {
        ...(dto.positionId !== undefined ? { positionId: dto.positionId } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        avatarUrl: true,
        position: { select: { id: true, name: true, permissions: true } },
      },
    });
  }

  /**
   * Attaches an already-registered user (by email) to the caller's organization —
   * moves them out of whichever organization they previously belonged to.
   */
  async addMember(organizationId: string, dto: AddMemberDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!existing) {
      throw new NotFoundException('No account with this email — they need to register first');
    }
    if (existing.organizationId === organizationId) {
      throw new ConflictException('This user is already a member of your organization');
    }

    return this.prisma.user.update({
      where: { id: existing.id },
      data: { organizationId, role: 'MANAGER', ...(dto.positionId ? { positionId: dto.positionId } : {}) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        avatarUrl: true,
        position: { select: { id: true, name: true, permissions: true } },
      },
    });
  }

  /** Mode 2: creates a brand-new account and attaches it directly to the caller's organization. */
  async createMember(organizationId: string, dto: CreateMemberDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        organizationId,
        role: 'MANAGER',
        ...(dto.positionId ? { positionId: dto.positionId } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        avatarUrl: true,
        position: { select: { id: true, name: true, permissions: true } },
      },
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (dto.newPassword) {
      if (!dto.currentPassword) throw new UnauthorizedException('Current password is required');
      const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!valid) throw new UnauthorizedException('Incorrect current password');
    }

    const data: {
      name?: string;
      passwordHash?: string;
      backgroundId?: string | null;
      backgroundFilter?: Prisma.InputJsonValue;
      backgroundImageUrl?: string | null;
      backgroundImageScope?: string | null;
      sidebarBackgroundId?: string | null;
      sidebarImageFilter?: Prisma.InputJsonValue;
      sidebarImageUrl?: string | null;
    } = {};
    if (dto.name) data.name = dto.name;
    if (dto.newPassword) data.passwordHash = await argon2.hash(dto.newPassword);
    if (dto.backgroundId !== undefined) data.backgroundId = dto.backgroundId;
    if (dto.backgroundFilter !== undefined) {
      data.backgroundFilter = dto.backgroundFilter as unknown as Prisma.InputJsonValue;
    }
    if (dto.removeBackgroundImage) data.backgroundImageUrl = null;
    if (dto.backgroundImageScope !== undefined) data.backgroundImageScope = dto.backgroundImageScope;
    if (dto.sidebarBackgroundId !== undefined) data.sidebarBackgroundId = dto.sidebarBackgroundId;
    if (dto.sidebarImageFilter !== undefined) {
      data.sidebarImageFilter = dto.sidebarImageFilter as unknown as Prisma.InputJsonValue;
    }
    if (dto.removeSidebarImage) data.sidebarImageUrl = null;

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: ME_SELECT,
    });
  }

  async updateAvatar(userId: string, file: { buffer: Buffer; mimeType: string }) {
    const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!ALLOWED.has(file.mimeType)) {
      throw new BadRequestException(`Unsupported image type: ${file.mimeType}. Allowed: PNG, JPEG, WEBP.`);
    }
    const ext = file.mimeType.split('/')[1];
    const key = `avatars/${userId}/${randomUUID()}.${ext}`;
    const url = await this.storage.upload(key, file.buffer, file.mimeType);

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
      select: { id: true, email: true, name: true, role: true, organizationId: true, avatarUrl: true },
    });
  }

  /**
   * Uploads a personal background photo (main/right area) — stored on the
   * User row itself, so it's only ever returned from /auth/me for the owning
   * account (never from /auth/members or any other org-facing endpoint).
   */
  async updateBackgroundImage(userId: string, file: { buffer: Buffer; mimeType: string }) {
    const url = await this.uploadUserImage(userId, 'backgrounds', file);
    return this.prisma.user.update({
      where: { id: userId },
      data: { backgroundImageUrl: url },
      select: ME_SELECT,
    });
  }

  /** Same as updateBackgroundImage but for the sidebar's own (left-side) photo. */
  async updateSidebarImage(userId: string, file: { buffer: Buffer; mimeType: string }) {
    const url = await this.uploadUserImage(userId, 'sidebars', file);
    return this.prisma.user.update({
      where: { id: userId },
      data: { sidebarImageUrl: url },
      select: ME_SELECT,
    });
  }

  private async uploadUserImage(
    userId: string,
    folder: string,
    file: { buffer: Buffer; mimeType: string },
  ): Promise<string> {
    const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!ALLOWED.has(file.mimeType)) {
      throw new BadRequestException(`Unsupported image type: ${file.mimeType}. Allowed: PNG, JPEG, WEBP.`);
    }
    const ext = file.mimeType.split('/')[1];
    const key = `${folder}/${userId}/${randomUUID()}.${ext}`;
    return this.storage.upload(key, file.buffer, file.mimeType);
  }
}
