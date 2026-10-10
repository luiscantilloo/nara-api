import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { SessionQueryService } from './session.service';

@Controller()
export class SessionController {
  constructor(private readonly session: SessionQueryService) {}

  @MessagePattern(Patterns.AUTH_ME)
  me(
    @Payload()
    data: { token: string | null; ip?: string | null; path?: string | null },
  ) {
    return this.session.me(data.token, { ip: data.ip, path: data.path });
  }

  @MessagePattern(Patterns.AUTH_VERIFY)
  verify(@Payload() data: { token: string | null }) {
    return this.session.verify(data.token);
  }
}
