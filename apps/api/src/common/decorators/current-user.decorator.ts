import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  organizationId: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>();
    return request.user;
  },
);

/**
 * Extracts the caller's organizationId, guaranteed non-null — throws for
 * accounts not yet attached to an organization. Use on any route that only
 * makes sense within an organization (documents, counterparties, templates, ...).
 */
export const CurrentOrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>();
    if (!request.user.organizationId) {
      throw new ForbiddenException('You must belong to an organization to perform this action');
    }
    return request.user.organizationId;
  },
);
