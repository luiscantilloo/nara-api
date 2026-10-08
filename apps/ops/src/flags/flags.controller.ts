import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { FlagsService } from './flags.service';

@Controller()
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @MessagePattern(Patterns.FLAGS_LIST)
  list(@Payload() d: { token: string | null }) {
    return this.flags.list(d.token);
  }

  @MessagePattern(Patterns.FLAGS_UPSERT)
  upsert(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.flags.upsert(d.token, d.body || {});
  }

  @MessagePattern(Patterns.FLAGS_PATCH)
  patch(@Payload() d: { token: string | null; body: Record<string, unknown> }) {
    return this.flags.patch(d.token, d.body || {});
  }
}
