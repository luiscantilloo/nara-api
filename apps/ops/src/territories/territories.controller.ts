import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { TerritoriesService } from './territories.service';

@Controller()
export class TerritoriesController {
  constructor(private readonly territories: TerritoriesService) {}

  @MessagePattern(Patterns.TERRITORIES_LIST)
  list(@Payload() d: { token: string | null }) {
    return this.territories.list(d.token);
  }

  @MessagePattern(Patterns.TERRITORIES_UPSERT)
  upsert(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.territories.upsert(d.token, d.body || {});
  }
}
