import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../../common/decorators/permissions.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>();
    const { role, sub } = request.user;

    // ADMIN always bypasses granular permission checks.
    if (role === 'ADMIN') return true;

    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { position: { select: { permissions: true } } },
    });

    if (!user?.position?.permissions.includes(required)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
