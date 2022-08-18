import { cotiPriceDbInit, validate } from './utils';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService, AppInitService } from './services';

@Module({
  imports: [validate(), cotiPriceDbInit(), ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [AppService, ConfigService, AppInitService, SchedulerService],
})
export class AppModule {}
