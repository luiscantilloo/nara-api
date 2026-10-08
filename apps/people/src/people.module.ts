import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule, MongoStore } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { PeopleController } from './people/people.controller';
import { PeopleService } from './people/people.service';
import { PatientsController } from './patients/patients.controller';
import { PatientsListService } from './patients/patients-list.service';
import { PatientsUpsertService } from './patients/patients-upsert.service';
import { PatientsMeService } from './patients/patients-me.service';
import { PatientsModulesService } from './patients/patients-modules.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthCoreModule,
  ],
  controllers: [PeopleController, PatientsController],
  providers: [
    PeopleService,
    PatientsListService,
    PatientsUpsertService,
    PatientsMeService,
    PatientsModulesService,
    MongoStore,
  ],
})
export class PeopleModule {}
