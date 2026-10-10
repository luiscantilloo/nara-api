import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { LoginService } from './login.service';

@Controller()
export class LoginController {
  constructor(private readonly loginService: LoginService) {}

  @MessagePattern(Patterns.AUTH_LOGIN)
  login(
    @Payload()
    data: {
      email: string;
      password: string;
      ip?: string | null;
      path?: string | null;
    },
  ) {
    return this.loginService.login(data.email, data.password, {
      ip: data.ip,
      path: data.path,
    });
  }

  @MessagePattern(Patterns.AUTH_LOGOUT)
  logout(@Payload() data: { token?: string | null }) {
    return this.loginService.logout(data?.token ?? null);
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
