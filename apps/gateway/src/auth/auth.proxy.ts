import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Patterns } from '@nara/common';
import { ProxyService } from '../proxy/proxy.service';
import { clearSession, readToken, sendResult } from '../proxy/http';

@Controller('auth')
export class AuthProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Res() res: Response,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'auth',
      Patterns.AUTH_LOGIN,
      {
        email: body.email || '',
        password: body.password || '',
      },
    );
    return sendResult(res, result);
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    await this.proxy.send('auth', Patterns.AUTH_LOGOUT, {});
    clearSession(res);
    return res.status(200).json({ ok: true });
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'auth',
      Patterns.AUTH_ME,
      {
        token: readToken(req),
      },
    );
    return sendResult(res, result);
  }

  @Post('verify-identity')
  async verifyIdentity(
    @Body()
    body: { email?: string; firstName?: string; lastName?: string },
    @Res() res: Response,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'auth',
      Patterns.AUTH_VERIFY_IDENTITY,
      {
        email: body.email || '',
        firstName: body.firstName || '',
        lastName: body.lastName || '',
      },
    );
    return sendResult(res, result);
  }

  @Post('reset-password')
  async resetPassword(
    @Body()
    body: { email?: string; resetToken?: string; password?: string },
    @Res() res: Response,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'auth',
      Patterns.AUTH_RESET_PASSWORD,
      {
        email: body.email || '',
        resetToken: body.resetToken || '',
        password: body.password || '',
      },
    );
    return sendResult(res, result);
  }
}
