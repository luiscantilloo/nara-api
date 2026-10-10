import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Patterns } from '@nara/common';
import { ProxyService } from '../proxy/proxy.service';
import { readToken, sendResult } from '../proxy/http';

@Controller()
export class HealthController {
  constructor(private readonly proxy: ProxyService) {}

  /** Público (lo usa el monitor). SPEC-10 FR-10.5: incluye el commit desplegado. */
  @Get('health')
  health() {
    return { ok: true, service: 'nara-gateway', commit: process.env.RENDER_GIT_COMMIT || null };
  }

  /** SPEC-05 FR-05.2: solo admin (401 sin sesión, 403 otro rol). */
  @Get('health/db')
  async healthDb(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.proxy.send<Record<string, unknown>>('ops', Patterns.HEALTH_DB, { token: readToken(req) });
      return sendResult(res, result);
    } catch {
      return res.status(503).json({ ok: false, error: 'ops offline' });
    }
  }
}
