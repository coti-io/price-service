import { Injectable, Logger } from '@nestjs/common';
import { AppService } from '../app.service';
import { DbNames, exec, sleep } from '../utils';
import moment from 'moment';
import { getManager } from 'typeorm';
import { getCurrencies } from '../entities';

const iterationCounter: Map<string, number> = new Map();
const missileString = '\u{1F680}';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('SchedulerService');
  constructor(private appService: AppService) {}

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

        const now = moment.now();
        const timeDiffInSeconds = (now - lastActivationTime) / 1000;
        const sleepTime = minIntervalInSeconds - timeDiffInSeconds;
        if (sleepTime > 0) {
          await sleep(sleepTime * 1000);
        }
        this.logger.log(`Task [${name}][iteration ${iterationCounter.get(name)}] ended`);
        iterationCounter.set(name, iterationCounter.get(name) + 1);
      }
    } catch (error) {
      this.logger.error(`Task [${name}][${error.message || error}]`);
      this.logger.error(`Task [${name}][terminated]`);
    }
  }

  async updatePriceSample(): Promise<void> {
    const tasks: Promise<void>[] = [];
    const manager = getManager(DbNames.PRICE_MONITOR);
    const currencies = await getCurrencies(manager);
    this.logger.debug(`${missileString} Starting update price scheduler `);
    for (const currency of currencies) {
      this.logger.debug(`Updating price to currency symbol: ${currency.symbol}`);
      tasks.push(this.appService.insertPriceSample(currency));
    }
    await Promise.allSettled(tasks);
    this.logger.debug(`${missileString}${missileString} Finished insert coti price scheduler `);
  }
}
