import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { AppStateService } from './app-state.service';

@Controller()
export class AppStateController {
  constructor(private readonly appState: AppStateService) {}

  @MessagePattern(Patterns.APP_STATE_GET)
  get(@Payload() d: { token: string | null }) {
    return this.appState.get(d.token);
  }

  @MessagePattern(Patterns.APP_STATE_PUT)
  put(@Payload() d: { token: string | null; body: Record<string, unknown> }) {
    return this.appState.put(d.token, d.body || {});
  }

  @MessagePattern(Patterns.ALERTS_CREATE)
  crearAlerta(@Payload() d: { token: string | null; body: Record<string, unknown> }) {
    return this.appState.crearAlerta(d.token, d.body || {});
  }
}
