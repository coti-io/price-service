import { Injectable, Logger } from '@nestjs/common';
import { AppService } from '../app.service';
import { DbNames, exec, getExchangeRate, insertPricesToDb, sleep } from '../utils';
import moment from 'moment';
import { EntityManager, getManager, LessThan, MoreThanOrEqual } from 'typeorm';
import { CurrenciesEntity, getCurrencies, isPriceExistsInDate, PriceSampleEntity } from '../entities';
import { TableNames } from '../enums';
import { ConfigService } from '@nestjs/config';

const iterationCounter: Map<string, number> = new Map();
const missileString = '\u{1F680}';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('SchedulerService');
  constructor(private appService: AppService, readonly configService: ConfigService) {}

  async runEveryXSeconds(name: string, functionToRun: () => Promise<any>, minIntervalInSeconds: number, enable: boolean) {
    if (!enable) return;
    try {
      let lastActivationTime;
      iterationCounter.set(name, 1);
      while (true) {
        this.logger.log(`Task [${name}][iteration ${iterationCounter.get(name)}] started`);
        lastActivationTime = moment.now();
        const [error] = await exec(functionToRun());
        if (error) this.logger.error(`Task [${name}][iteration ${iterationCounter.get(name)}] [${error.message || error}]`);

        this.logger.log(`Task [${name}][iteration ${iterationCounter.get(name)}] ended`);

        const now = moment.now();
        const timeDiffInSeconds = (now - lastActivationTime) / 1000;
        const sleepTime = minIntervalInSeconds - timeDiffInSeconds;
        if (sleepTime > 0) {
          await sleep(sleepTime * 1000);
        }
        iterationCounter.set(name, iterationCounter.get(name) + 1);
      }
    } catch (error) {
      this.logger.error(`Task [${name}][${error.message || error}]`);
      this.logger.error(`Task [${name}][terminated]`);
    }
  }

  async updatePriceSample(): Promise<void> {
    const manager = getManager(DbNames.PRICE_MONITOR);
    const currencies = await getCurrencies(manager);
    this.logger.debug(`[updatePriceSample][Starting update price scheduler]`);
    for (const currency of currencies) {
      this.logger.debug(`[updatePriceSample][Updating price to currency symbol: ${currency.symbol}]`);
      await this.appService.insertPriceSample(currency);
    }
    this.logger.debug(`[updatePriceSample][Finished insert coti price scheduler]`);
  }

  async fillTimeGapsForPastDay(currency: CurrenciesEntity, manager: EntityManager, from: Date, to: Date): Promise<void> {
    let currDate = from;
    while (currDate <= to) {
      currDate = moment(currDate).add(1, 'minutes').toDate();
      const exists = await isPriceExistsInDate(manager, currency.id, currDate);
      if (exists) {
        this.logger.debug(`Price already exists for currency: ${currency.symbol} time: ${currDate.toISOString()} skipping!`);
        continue;
      }
      this.logger.debug(`Filling gap for currency: ${currency.symbol} time: ${currDate.toISOString()}`);
      const [error, cotiExchangeRate] = await exec(getExchangeRate(this.configService, currency.symbol, currDate));
      if (error) throw error;
      const [insertError] = await exec(insertPricesToDb(manager, cotiExchangeRate, currency, currDate));
      if (insertError) throw insertError;
      await sleep(5000);
    }
  }

  async isPriceSampleGap(manager: EntityManager, currencyId: number, from: Date, to: Date, expectedPriceSamples: number) {
    const [error, count] = await exec(
      manager
        .getRepository<PriceSampleEntity>(TableNames.PRICE_SAMPLES)
        .createQueryBuilder()
        .where({ timestamp: MoreThanOrEqual(from) })
        .andWhere({ timestamp: LessThan(to) })
        .andWhere({ currencyId })
        .getCount(),
    );
    if (error) throw error;
    return count != expectedPriceSamples;
  }

  async fillGap(manager: EntityManager, currency: CurrenciesEntity) {
    const maximumGapCheckInDays = 30;
    const threshold = 2;
    const fromDate = moment().subtract(maximumGapCheckInDays, 'days').startOf('minute').toDate();
    const toDate = moment().subtract(threshold, 'minute').startOf('minute').toDate();
    const expectedPriceSamples = 60 * 24 * maximumGapCheckInDays - threshold;
    const isGapInPastMonth = await this.isPriceSampleGap(manager, currency.id, fromDate, toDate, expectedPriceSamples);
    if (isGapInPastMonth) {
      let fillGapFromDate = moment(fromDate).subtract(threshold, 'minutes').toDate();
      while (fillGapFromDate <= toDate) {
        fillGapFromDate = moment(fillGapFromDate).add(1, 'day').toDate();
        const to = moment(fillGapFromDate).add(1, 'hour').toDate();
        const expectedResults = 60 - threshold;
        const isGapInPastDay = await this.isPriceSampleGap(manager, currency.id, fillGapFromDate, to, expectedResults);
        if (isGapInPastDay) {
          await this.fillTimeGapsForPastDay(currency, manager, fillGapFromDate, to);
          const isStillGapInPastMonth = await this.isPriceSampleGap(manager, currency.id, fromDate, toDate, expectedPriceSamples);
          if (!isStillGapInPastMonth) break;
        }
      }
    }
  }
}
