import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { ExpertsService } from './experts.service';

@Controller()
export class ExpertsController {
  constructor(private readonly experts: ExpertsService) {}

  @MessagePattern(Patterns.EXPERTS_LIST)
  list(@Payload() d: { token: string | null }) {
    return this.experts.list(d.token);
  }

  @MessagePattern(Patterns.EXPERTS_UPSERT)
  upsert(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.experts.upsert(d.token, d.body || {});
  }
}
