import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { Pattern } from '@nara/common';

@Injectable()
export class ProxyService {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: ClientProxy,
    @Inject('PEOPLE_SERVICE') private readonly people: ClientProxy,
    @Inject('OPS_SERVICE') private readonly ops: ClientProxy,
    @Inject('AI_SERVICE') private readonly ai: ClientProxy,
  ) {}

  private client(which: 'auth' | 'people' | 'ops' | 'ai') {
    return { auth: this.auth, people: this.people, ops: this.ops, ai: this.ai }[
      which
    ];
  }

  async send<T = Record<string, unknown>>(
    which: 'auth' | 'people' | 'ops' | 'ai',
    pattern: Pattern,
    payload: unknown,
  ): Promise<T> {
    return firstValueFrom(
      this.client(which).send<T>(pattern, payload).pipe(timeout(30_000)),
    );
  }
}
