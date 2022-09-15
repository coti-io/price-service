import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import moment from 'moment';
import { SchedulerService } from '.';
import { EntityManager, getManager } from 'typeorm';
import { AppStateEntity, CurrenciesEntity, getCurrencies, getLastCurrencyPrice, isPriceExists } from '../entities';
import { DbNames, exec, getExchangeRate, insertPricesToDb, sleep } from '../utils';
import { AppStateNames, TableNames } from 'src/enums';

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
      const enforceFillGap = this.configService.get<boolean>('ENFORCE_FILL_GAP');
      await this.fillPriceGap(enforceFillGap);
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
    const cotiPriceFreqInSeconds = this.configService.get<number>('COTI_PRICE_FREQUENCY_IN_SECONDS');
    this.scheduler.runEveryXSeconds('COTI_PRICE_RATE', this.scheduler.updatePriceSample.bind(this.scheduler), cotiPriceFreqInSeconds, true).catch(error => {
      this.logger.error(`{intervalsInitialization} ${error}`);
    });
  }

  async fillPriceGap(enforceFillGap: boolean): Promise<void> {
    const promises: Promise<void>[] = [];
    const manager = getManager(DbNames.PRICE_MONITOR);
    const currencies = await getCurrencies(manager);
    for (const currency of currencies) {
      promises.push(this.fillTimeGapsInDb(currency, manager));
    }
    const responses = await Promise.allSettled(promises);
    const rejectedResponses = responses.filter(x => x.status === 'rejected').map(x => x as PromiseRejectedResult);
    rejectedResponses.forEach(response => this.logger.error(response.reason));
    if (enforceFillGap && rejectedResponses.length > 0) {
      process.exit(0);
    }
  }
  async fillTimeGapsInDb(currency: CurrenciesEntity, manager: EntityManager): Promise<void> {
    const lastPrice = await getLastCurrencyPrice(manager, currency);

    const now = moment();
    const monitorFrom = moment(currency.monitorFrom);
    const lastPriceDate = lastPrice ? moment(lastPrice.timestamp) : moment();

    let curTime = lastPriceDate.isAfter(monitorFrom) ? lastPriceDate.toDate() : monitorFrom.toDate();
    const diffInMonths = now.diff(lastPriceDate, 'months');
    if (diffInMonths > 1) {
      curTime = moment().subtract(1, 'months').toDate();
    }
    const diffInMinutes = now.diff(curTime, 'minutes');
    if (diffInMinutes === 0) return;
    while (curTime <= now.toDate()) {
      curTime = moment(curTime).add(1, 'minute').toDate();
      const exists = await isPriceExists(manager, currency.id);
      if (exists) {
        this.logger.debug(`Price already exists for currency: ${currency.symbol} time: ${moment().toDate().toISOString()} skipping!`);
        continue;
      }
      this.logger.debug(`Filling gap for currency: ${currency.symbol} time: ${curTime.toISOString()}`);
      const [error, cotiExchangeRate] = await exec(getExchangeRate(this.configService, currency.symbol, curTime));
      if (error) throw error;
      const [insertError] = await exec(insertPricesToDb(manager, cotiExchangeRate, currency, curTime));
      if (insertError) throw insertError;
      await sleep(5000);
    }
  }
}
