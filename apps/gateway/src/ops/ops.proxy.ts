import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Patterns, type Pattern } from '@nara/common';
import { ProxyService } from '../proxy/proxy.service';
import { readToken, sendResult } from '../proxy/http';

@Controller()
export class OpsProxyController {
  constructor(private readonly proxy: ProxyService) {}

  private async send(
    req: Request,
    res: Response,
    which: 'ops',
    pattern: Pattern,
    extra: Record<string, unknown> = {},
  ) {
    const result = await this.proxy.send<Record<string, unknown>>(
      which,
      pattern,
      {
        token: readToken(req),
        ...extra,
      },
    );
    return sendResult(res, result);
  }

  @Get('accounts')
  accounts(@Req() req: Request, @Res() res: Response) {
    return this.send(req, res, 'ops', Patterns.ACCOUNTS_LIST);
  }

  @Post('accounts')
  accountsPost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.ACCOUNTS_UPSERT, { body });
  }

  @Get('accounts/me')
  accountsMe(@Req() req: Request, @Res() res: Response) {
    return this.send(req, res, 'ops', Patterns.ACCOUNTS_ME);
  }

  @Patch('accounts/me')
  accountsMePatch(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.ACCOUNTS_ME_PATCH, { body });
  }

  @Get('territories')
  territories(@Req() req: Request, @Res() res: Response) {
    return this.send(req, res, 'ops', Patterns.TERRITORIES_LIST);
  }

  @Post('territories')
  territoriesPost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.TERRITORIES_UPSERT, { body });
  }

  @Get('experts')
  experts(@Req() req: Request, @Res() res: Response) {
    return this.send(req, res, 'ops', Patterns.EXPERTS_LIST);
  }

  @Post('experts')
  expertsPost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.EXPERTS_UPSERT, { body });
  }

  @Get('worklists')
  worklists(
    @Req() req: Request,
    @Res() res: Response,
    @Query('expertId') expertId?: string,
  ) {
    return this.send(req, res, 'ops', Patterns.WORKLISTS_LIST, { expertId });
  }

  @Post('worklists')
  worklistsPost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.WORKLISTS_UPSERT, { body });
  }

  @Patch('worklists')
  worklistsPatch(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.WORKLISTS_PATCH, { body });
  }

  @Get('flags')
  flags(@Req() req: Request, @Res() res: Response) {
    return this.send(req, res, 'ops', Patterns.FLAGS_LIST);
  }

  @Post('flags')
  flagsPost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.FLAGS_UPSERT, { body });
  }

  @Patch('flags')
  flagsPatch(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.FLAGS_PATCH, { body });
  }

  @Get('assets')
  assets(@Req() req: Request, @Res() res: Response) {
    return this.send(req, res, 'ops', Patterns.ASSETS_LIST);
  }

  @Post('assets/bracelets')
  bracelets(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.ASSETS_BRACELETS, { body });
  }

  @Post('assets/tablet')
  tablet(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.ASSETS_TABLET, { body });
  }

  @Get('app-state')
  appStateGet(@Req() req: Request, @Res() res: Response) {
    return this.send(req, res, 'ops', Patterns.APP_STATE_GET);
  }

  @Put('app-state')
  appStatePut(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Record<string, unknown>,
  ) {
    return this.send(req, res, 'ops', Patterns.APP_STATE_PUT, { body });
  }
}
