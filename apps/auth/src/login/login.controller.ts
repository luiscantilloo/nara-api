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
}
