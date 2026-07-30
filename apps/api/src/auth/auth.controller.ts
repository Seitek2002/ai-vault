import { Controller, Post, Get, Patch, Body, Param, Req, BadRequestException, HttpCode, HttpStatus, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Permission } from '../common/permissions';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  UpdateMeDto,
  AddMemberDto,
  CreateMemberDto,
  UpdateMemberDto,
  CreateOrganizationDto,
} from './dto/auth.dto';
import { CurrentUser, CurrentOrgId, type JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from './guards/jwt-auth.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

async function readMultipartFile(req: FastifyRequest): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const file = await (
    req as FastifyRequest & { file: () => Promise<{ mimetype: string; toBuffer: () => Promise<Buffer> } | undefined> }
  ).file();
  if (!file) return null;
  return { buffer: await file.toBuffer(), mimeType: file.mimetype };
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: JwtPayload) {
    return this.auth.logout(user.sub);
  }

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.auth.getMe(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(user.sub, dto);
  }

  @Post('me/avatar')
  async uploadAvatar(@Req() req: FastifyRequest, @CurrentUser() user: JwtPayload) {
    const file = await readMultipartFile(req);
    if (!file) throw new BadRequestException('No file provided');
    return this.auth.updateAvatar(user.sub, file);
  }

  @Post('me/background-image')
  async uploadBackgroundImage(@Req() req: FastifyRequest, @CurrentUser() user: JwtPayload) {
    const file = await readMultipartFile(req);
    if (!file) throw new BadRequestException('No file provided');
    return this.auth.updateBackgroundImage(user.sub, file);
  }

  @Post('me/sidebar-image')
  async uploadSidebarImage(@Req() req: FastifyRequest, @CurrentUser() user: JwtPayload) {
    const file = await readMultipartFile(req);
    if (!file) throw new BadRequestException('No file provided');
    return this.auth.updateSidebarImage(user.sub, file);
  }

  @Post('organization')
  createOrganization(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrganizationDto) {
    return this.auth.createOrganization(user.sub, dto);
  }

  @Get('members')
  listMembers(@CurrentOrgId() organizationId: string) {
    return this.auth.listMembers(organizationId);
  }

  @Post('members')
  @RequirePermission(Permission.MANAGE_EMPLOYEES)
  addMember(@CurrentOrgId() organizationId: string, @Body() dto: AddMemberDto) {
    return this.auth.addMember(organizationId, dto);
  }

  @Post('members/create')
  @RequirePermission(Permission.MANAGE_EMPLOYEES)
  createMember(@CurrentOrgId() organizationId: string, @Body() dto: CreateMemberDto) {
    return this.auth.createMember(organizationId, dto);
  }

  @Patch('members/:id')
  @RequirePermission(Permission.MANAGE_EMPLOYEES)
  updateMember(
    @Param('id') id: string,
    @CurrentOrgId() organizationId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.auth.updateMember(organizationId, id, dto);
  }
}
