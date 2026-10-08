import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { AssetsService } from './assets.service';

@Controller()
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @MessagePattern(Patterns.ASSETS_LIST)
  list(@Payload() d: { token: string | null }) {
    return this.assets.list(d.token);
  }

  @MessagePattern(Patterns.ASSETS_BRACELETS)
  bracelets(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.assets.bracelets(d.token, d.body || {});
  }

  @MessagePattern(Patterns.ASSETS_TABLET)
  tablet(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.assets.tablet(d.token, d.body || {});
  }
}
