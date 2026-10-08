import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule, MongoStore } from '@nara/database';
import { AuthCoreModule } from '@nara/auth-core';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { TerritoriesController } from './territories/territories.controller';
import { TerritoriesService } from './territories/territories.service';
import { ExpertsController } from './experts/experts.controller';
import { ExpertsService } from './experts/experts.service';
import { WorklistsController } from './worklists/worklists.controller';
import { WorklistsService } from './worklists/worklists.service';
import { FlagsController } from './flags/flags.controller';
import { FlagsService } from './flags/flags.service';
import { AssetsController } from './assets/assets.controller';
import { AssetsService } from './assets/assets.service';
import { AppStateController } from './app-state/app-state.controller';
import { AppStateService } from './app-state/app-state.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthCoreModule,
  ],
  controllers: [
    HealthController,
    AccountsController,
    TerritoriesController,
    ExpertsController,
    WorklistsController,
    FlagsController,
    AssetsController,
    AppStateController,
  ],
  providers: [
    HealthService,
    AccountsService,
    TerritoriesService,
    ExpertsService,
    WorklistsService,
    FlagsService,
    AssetsService,
    AppStateService,
    MongoStore,
  ],
})
export class OpsModule {}
