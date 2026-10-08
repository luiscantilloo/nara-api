import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @MessagePattern(Patterns.HEALTH_DB)
  healthDb() {
    return this.health.healthDb();
  }
}
