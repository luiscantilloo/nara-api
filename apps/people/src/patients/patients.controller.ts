import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Patterns } from '@nara/common';
import { PatientsListService } from './patients-list.service';
import { PatientsUpsertService } from './patients-upsert.service';
import { PatientsMeService } from './patients-me.service';
import { PatientsModulesService } from './patients-modules.service';

@Controller()
export class PatientsController {
  constructor(
    private readonly listService: PatientsListService,
    private readonly upsertService: PatientsUpsertService,
    private readonly meService: PatientsMeService,
    private readonly modulesService: PatientsModulesService,
  ) {}

  @MessagePattern(Patterns.PATIENTS_LIST)
  list(@Payload() data: { token: string | null }) {
    return this.listService.list(data);
  }

  @MessagePattern(Patterns.PATIENTS_UPSERT)
  upsert(
    @Payload() data: { token: string | null; body: Record<string, unknown> },
  ) {
    return this.upsertService.upsert(data);
  }

  @MessagePattern(Patterns.PATIENTS_ME)
  me(@Payload() data: { token: string | null }) {
    return this.meService.me(data);
  }

  @MessagePattern(Patterns.PATIENTS_MODULES)
  modules(
    @Payload()
    data: {
      token: string | null;
      body?: Record<string, unknown>;
      method?: string;
    },
  ) {
    return this.modulesService.modules(data);
  }
}
