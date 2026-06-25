import { Controller, Post, Get, Patch, Body, HttpCode, HttpStatus, SetMetadata } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto, UpdateMeDto } from './dto/auth.dto';
import { CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from './guards/jwt-auth.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

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
}
