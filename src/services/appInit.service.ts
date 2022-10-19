import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerService } from '.';
import { getManager } from 'typeorm';
import { AppStateEntity } from '../entities';
import { DbNames, exec } from '../utils';
import { AppStateNames, TableNames } from '../enums';

@Injectable()
export class AppInitService implements OnModuleInit {
  private readonly logger = new Logger('AppInitService');

  constructor(private scheduler: SchedulerService, private configService: ConfigService) {}

  async onModuleInit() {
    try {
      await this.init();
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async init() {
    try {
      await this.initAppStates();
      this.intervalsInitialization();
    } catch (e) {
      this.logger.error(e);
      this.logger.error('Init service failed to initiate');
      process.exit(1);
    }
  }

  async initAppStates() {
    const manager = getManager(DbNames.PRICE_MONITOR);
    const appStateToSave = [];
    const [appStatesError, appStates] = await exec(manager.getRepository<AppStateEntity>(TableNames.APP_STATES).find());
    if (appStatesError) throw new InternalServerErrorException(appStatesError);

    if (!appStates.find(appState => appState.name === AppStateNames.GET_PRICE_LOCK)) {
      appStateToSave.push(
        manager.getRepository<AppStateEntity>(TableNames.APP_STATES).create({
          name: AppStateNames.GET_PRICE_LOCK,
          value: '1',
        }),
      );
    }
    if (appStateToSave.length > 0) {
      const [appStateError] = await exec(manager.getRepository<AppStateEntity>(TableNames.APP_STATES).save(appStateToSave));
      if (appStateError) throw new InternalServerErrorException(appStateError);
    }
  }

  intervalsInitialization() {
    const priceFreqInSeconds = this.configService.get<number>('INTERVAL_PRICE_FREQUENCY_IN_SECONDS');
    const priceFillGapFreqInSeconds = this.configService.get<number>('INTERVAL_PRICE_FILL_GAP_FREQUENCY_IN_SECONDS');
    const priceFillGapEnable = this.configService.get<boolean>('INTERVAL_FILL_GAP_ENABLE');
    this.scheduler.runEveryXSeconds('INSERT_PRICE', this.scheduler.updatePriceSample.bind(this.scheduler), priceFreqInSeconds, true).catch(error => {
      this.logger.error(`{intervalsInitialization}{INSERT_PRICE} ${error}`);
    });

    this.scheduler.runEveryXSeconds('PRICE_FILL_GAP', this.scheduler.fillGap.bind(this.scheduler), priceFillGapFreqInSeconds, priceFillGapEnable).catch(error => {
      this.logger.error(`{intervalsInitialization}{PRICE_FILL_GAP} ${error}`);
    });
  }
}
