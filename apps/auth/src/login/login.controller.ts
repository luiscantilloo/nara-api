import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { LoginService } from './login.service';

@Controller()
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  @MessagePattern(Patterns.AUTH_LOGIN)
  login(@Payload() data: { email: string; password: string }) {
    return this.loginService.login(data.email, data.password);
  }

  @MessagePattern(Patterns.AUTH_LOGOUT)
  logout() {
    return { ok: true, status: 200 };
  }

  // SPEC-01 FR-01.1: verify-identity y reset-password quedan retirados (el gateway responde 410).

  @MessagePattern(Patterns.AUTH_ASSISTED_RESET)
  assistedReset(@Payload() data: { token: string | null; accountId: string }) {
    return this.loginService.assistedReset(data.token, data.accountId);
  }

  @MessagePattern(Patterns.AUTH_CHANGE_PASSWORD)
  changePassword(@Payload() data: { token: string | null; newPassword: string }) {
    return this.loginService.changePassword(data.token, data.newPassword);
  }
}
