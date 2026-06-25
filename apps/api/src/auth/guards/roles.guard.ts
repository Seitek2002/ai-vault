import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>();
    if (!required.includes(request.user.role as UserRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
