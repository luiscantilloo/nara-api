import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { PeopleService } from './people.service';

@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @MessagePattern(Patterns.PEOPLE_LIST)
  list(
    @Payload()
    data: {
      token: string | null;
      limit?: number;
      skip?: number;
      terr?: string;
      q?: string;
    },
  ) {
    return this.people.list(data);
  }

  @MessagePattern(Patterns.PEOPLE_UPSERT)
  upsert(
    @Payload() data: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.people.upsert(data);
  }
}
