import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Patterns } from '@nara/common';
import { ProxyService } from '../proxy/proxy.service';
import { clearSession, readToken, requestMeta, sendResult } from '../proxy/http';

@Controller('auth')
export class AuthProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Post('login')
  async login(
    @Req() req: Request,
    @Body() body: { email?: unknown; password?: unknown },
    @Res() res: Response,
  ) {
    // H-007: correo y clave deben ser texto; un objeto ({"$gt":""}) es una petición inválida.
    const email = body?.email ?? '';
    const password = body?.password ?? '';
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'Correo y contraseña deben ser texto.' });
    }
    const meta = requestMeta(req);
    const result = await this.proxy.send<Record<string, unknown>>(
      'auth',
      Patterns.AUTH_LOGIN,
      { email, password, ...meta },
    );
    return sendResult(res, result);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.proxy.send('auth', Patterns.AUTH_LOGOUT, { token: readToken(req) });
    clearSession(res);
    return res.status(200).json({ ok: true });
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    // H-015: sin cookie no hay nada que validar; responder «sin sesión» sin error en la consola.
    const token = readToken(req);
    if (!token) return res.status(200).json({ ok: true, user: null });
    const meta = requestMeta(req);
    const result = await this.proxy.send<Record<string, unknown>>(
      'auth',
      Patterns.AUTH_ME,
      { token, ...meta },
    );
    return sendResult(res, result);
  }

  // SPEC-01 FR-01.1 (P-9): el flujo que entregaba un token de restablecimiento a quien supiera
  // correo, nombre y apellido queda retirado.
  @Post('verify-identity')
  verifyIdentity(@Res() res: Response) {
    return res.status(410).json({ ok: false, error: 'Este método de recuperación ya no existe. Pida al administrador que le restablezca la clave.' });
  }

  @Post('reset-password')
  resetPassword(@Res() res: Response) {
    return res.status(410).json({ ok: false, error: 'Este método de recuperación ya no existe. Pida al administrador que le restablezca la clave.' });
  }

  @Post('assisted-reset')
  async assistedReset(@Req() req: Request, @Body() body: { accountId?: string }, @Res() res: Response) {
    const result = await this.proxy.send<Record<string, unknown>>('auth', Patterns.AUTH_ASSISTED_RESET, {
      token: readToken(req),
      accountId: body.accountId || '',
    });
    return sendResult(res, result);
  }

  @Post('change-password')
  async changePassword(@Req() req: Request, @Body() body: { newPassword?: string }, @Res() res: Response) {
    const result = await this.proxy.send<Record<string, unknown>>('auth', Patterns.AUTH_CHANGE_PASSWORD, {
      token: readToken(req),
      newPassword: body.newPassword || '',
    });
    return sendResult(res, result);
  }
}
