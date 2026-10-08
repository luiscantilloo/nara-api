import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { WorklistsService } from './worklists.service';

@Controller()
export class WorklistsController {
  constructor(private readonly worklists: WorklistsService) {}

  @MessagePattern(Patterns.WORKLISTS_LIST)
  list(@Payload() d: { token: string | null; expertId?: string }) {
    return this.worklists.list(d.token, d.expertId);
  }

  @MessagePattern(Patterns.WORKLISTS_UPSERT)
  upsert(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.worklists.upsert(d.token, d.body || {});
  }

  @MessagePattern(Patterns.WORKLISTS_PATCH)
  patch(@Payload() d: { token: string | null; body: Record<string, unknown> }) {
    return this.worklists.patch(d.token, d.body || {});
  }
}
