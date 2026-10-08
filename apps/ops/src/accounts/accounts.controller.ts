import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { AccountsService } from './accounts.service';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @MessagePattern(Patterns.ACCOUNTS_LIST)
  list(@Payload() d: { token: string | null }) {
    return this.accounts.list(d.token);
  }

  @MessagePattern(Patterns.ACCOUNTS_UPSERT)
  upsert(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.accounts.upsert(d.token, d.body || {});
  }

  @MessagePattern(Patterns.ACCOUNTS_ME)
  me(@Payload() d: { token: string | null }) {
    return this.accounts.me(d.token);
  }

  @MessagePattern(Patterns.ACCOUNTS_ME_PATCH)
  mePatch(
    @Payload() d: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.accounts.mePatch(d.token, d.body || {});
  }
}
