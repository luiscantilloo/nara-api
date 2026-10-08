import { Body, Controller, Post, Req, Res } from '@nestjs/common';
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
  }

  @Post('chat')
  async chat(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
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
  }
}
