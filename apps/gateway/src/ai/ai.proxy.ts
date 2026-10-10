import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Patterns } from '@nara/common';
import { ProxyService } from '../proxy/proxy.service';
import { readToken, sendResult } from '../proxy/http';

@Controller('teo')
export class AiProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Post('ask')
  async ask(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const result = await this.proxy.send<Record<string, unknown>>(
        'ai',
        Patterns.TEO_ASK,
        {
          token: readToken(req),
          question: body.question || body.text || body.q,
          text: body.text || body.question,
          role: body.role,
        },
      );
      return sendResult(res, result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Servicio TEO no disponible';
      return res.status(503).json({
        ok: false,
        error:
          'TEO no pudo conectar con el servicio de IA. Reinicie nara-api (ai en :4004). ' +
          message,
      });
    }
  }

  @Post('chat')
  async chat(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const result = await this.proxy.send<Record<string, unknown>>(
        'ai',
        Patterns.TEO_CHAT,
        {
          token: readToken(req),
          message: body.message,
          history: body.history,
          patientName: body.patientName,
          place: body.place,
          profile: body.profile,
          age: body.age,
          messages: body.messages,
          system: body.system,
        },
      );
      return sendResult(res, result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Servicio TEO no disponible';
      return res.status(503).json({
        ok: false,
        error:
          'TEO no pudo conectar con el servicio de IA. Reinicie nara-api (ai en :4004). ' +
          message,
      });
    }
  }

  @Get('conversations')
  async listConversations(
    @Req() req: Request,
    @Res() res: Response,
    @Query('patientId') patientId?: string,
    @Query('patientName') patientName?: string,
  ) {
    try {
      const result = await this.proxy.send<Record<string, unknown>>(
        'ai',
        Patterns.TEO_CONVERSATIONS_LIST,
        {
          token: readToken(req),
          patientId,
          patientName,
        },
      );
      return sendResult(res, result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Servicio TEO no disponible';
      return res.status(503).json({
        ok: false,
        error: 'No se pudieron cargar las conversaciones. ' + message,
      });
    }
  }

  @Post('conversations')
  async upsertConversation(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const result = await this.proxy.send<Record<string, unknown>>(
        'ai',
        Patterns.TEO_CONVERSATIONS_UPSERT,
        {
          token: readToken(req),
          body,
        },
      );
      return sendResult(res, result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Servicio TEO no disponible';
      return res.status(503).json({
        ok: false,
        error: 'No se pudo guardar la conversación. ' + message,
      });
    }
  }
}
