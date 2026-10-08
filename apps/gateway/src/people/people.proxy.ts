import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Patterns } from '@nara/common';
import { ProxyService } from '../proxy/proxy.service';
import { readToken, sendResult } from '../proxy/http';

@Controller()
export class PeopleProxyController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('people')
  async listPeople(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('terr') terr?: string,
    @Query('q') q?: string,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PEOPLE_LIST,
      {
        token: readToken(req),
        limit: limit ? Number(limit) : undefined,
        skip: skip ? Number(skip) : undefined,
        terr,
        q,
      },
    );
    return sendResult(res, result);
  }

  @Post('people')
  async upsertPeople(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PEOPLE_UPSERT,
      {
        token: readToken(req),
        body,
      },
    );
    return sendResult(res, result);
  }

  @Get('patients')
  async patients(@Req() req: Request, @Res() res: Response) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PATIENTS_LIST,
      {
        token: readToken(req),
      },
    );
    return sendResult(res, result);
  }

  @Post('patients')
  async patientsUpsert(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PATIENTS_UPSERT,
      {
        token: readToken(req),
        body,
      },
    );
    return sendResult(res, result);
  }

  @Get('patients/me')
  async patientsMe(@Req() req: Request, @Res() res: Response) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PATIENTS_ME,
      {
        token: readToken(req),
      },
    );
    return sendResult(res, result);
  }

  @Get('patients/modules')
  async getModules(@Req() req: Request, @Res() res: Response) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PATIENTS_MODULES,
      {
        token: readToken(req),
        method: 'GET',
      },
    );
    return sendResult(res, result);
  }

  @Post('patients/modules')
  async postModules(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PATIENTS_MODULES,
      {
        token: readToken(req),
        body,
        method: 'POST',
      },
    );
    return sendResult(res, result);
  }

  @Patch('patients/modules')
  async patchModules(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      'people',
      Patterns.PATIENTS_MODULES,
      {
        token: readToken(req),
        body,
        method: 'PATCH',
      },
    );
    return sendResult(res, result);
  }
}
