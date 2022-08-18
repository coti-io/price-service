import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, getManager } from 'typeorm';
import { CreateCurrencyRequestDto, Prices, GetPriceByDexRequestDto, GetPriceByDexResponseDto, GetPriceRequestDto, GetPriceResponseDto } from './dtos';
import { createNewCurrency, CurrenciesEntity, getAppStateByName, getCurrencyBySymbol, getPrice, isPriceExists, PriceSampleEntity } from './entities';
import { DbNames, Exchanges, exchangesNameMapping, exec, getExchangeRate, insertPricesToDb } from './utils';
import moment from 'moment';
import { AppStateNames } from './enums';

@Injectable()
export class AppService {
  private readonly logger = new Logger('AppService');

  constructor(private configService: ConfigService) {}

  async insertPriceSample(currency: CurrenciesEntity) {
    const manager = getManager(DbNames.PRICE_MONITOR);
    try {
      const exists = await isPriceExists(manager, currency.id);
      if (exists) {
        this.logger.debug(`Price already exists for currency: ${currency.symbol} time: ${moment().toDate().toISOString()} skipping!`);
        return;
      }
      const cotiExchangeRate = await getExchangeRate(this.configService, currency.symbol);
      await manager.transaction(async transactionalEntityManager => {
        const [saveError] = await exec(insertPricesToDb(transactionalEntityManager, cotiExchangeRate, currency));
        if (saveError) throw saveError;
        this.logger.debug(`Currency ${currency} usd price sample created ${new Date()}`);
      });
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.logger.debug(`findAll start current free connections after release ${manager['connection']['driver']['pool']['_freeConnections'].length}`);
    }
  }

  private getPriceValidation(date: Date) {
    const now = moment();
    const requestDate = moment(date).toDate();
    if (requestDate > now.toDate()) {
      this.logger.error(`Failed to determine future price ${requestDate} `);
      throw new BadRequestException(`Failed to determine future price ${requestDate} `);
    }
  }

  async createCurrency(createCurrencyRequest: CreateCurrencyRequestDto) {
    const manager = getManager(DbNames.PRICE_MONITOR);
    const newCurrency = await createNewCurrency(manager, createCurrencyRequest);
    return { symbol: newCurrency.symbol, monitorFrom: newCurrency.monitorFrom };
  }

  async getPriceByDex(getPriceByDex: GetPriceByDexRequestDto): Promise<GetPriceByDexResponseDto> {
    const manager = getManager(DbNames.PRICE_MONITOR);

    this.getPriceValidation(getPriceByDex.date);
    const currency = await getCurrencyBySymbol(manager, getPriceByDex.currency);
    if (!currency) throw new BadRequestException(`Currency ${getPriceByDex.currency} not found.`);
    const requestedPriceSample = await getPrice(manager, getPriceByDex.date, currency.id);
    let dexPrice = requestedPriceSample ? requestedPriceSample[exchangesNameMapping[getPriceByDex.dex.toUpperCase()]] : undefined;
    const sample = await this.validateGetPriceResponse(manager, dexPrice, getPriceByDex.date, currency, getPriceByDex.dex);
    if (sample) dexPrice = sample ? sample[exchangesNameMapping[getPriceByDex.dex.toUpperCase()]] : undefined;
    const date = requestedPriceSample?.timestamp || getPriceByDex.date;
    return this.prepareGetPriceByDexResponse(manager, dexPrice, date, currency.id);
  }

  async getPriceFromAllSources(getPriceRequest: GetPriceRequestDto): Promise<GetPriceResponseDto> {
    const manager = getManager(DbNames.PRICE_MONITOR);
    this.getPriceValidation(getPriceRequest.date);
    const currency = await getCurrencyBySymbol(manager, getPriceRequest.currency);
    if (!currency) throw new BadRequestException(`Currency ${getPriceRequest.currency} not found.`);
    let requestedPriceSample = await getPrice(manager, getPriceRequest.date, currency.id);
    const cmcPrice = requestedPriceSample ? requestedPriceSample[exchangesNameMapping[Exchanges.CMC.toUpperCase()]] : undefined;
    const sample = await this.validateGetPriceResponse(manager, cmcPrice, getPriceRequest.date, currency);
    if (sample) requestedPriceSample = sample;
    const date = requestedPriceSample?.timestamp || getPriceRequest.date;
    return this.prepareGetPriceResponse(manager, currency.id, date, requestedPriceSample);
  }

  async prepareGetPriceResponse(manager: EntityManager, currencyId: number, date: Date, priceSample: PriceSampleEntity) {
    const prices: Prices = {};
    if (!priceSample) {
      priceSample = await getPrice(manager, date, currencyId);
      const dexPrice = priceSample ? priceSample[exchangesNameMapping[Exchanges.CMC.toUpperCase()]] : undefined;
      if (!dexPrice) throw new BadRequestException(`Could not get price for all sources date: ${date}`);
    }
    if (priceSample) {
      Object.values(exchangesNameMapping).forEach(exchange => {
        prices[exchange] = priceSample[exchange];
      });
    }
    return new GetPriceResponseDto(prices, moment(priceSample.timestamp).utc(true).toDate());
  }

  async prepareGetPriceByDexResponse(manager: EntityManager, dexPrice: string, date: Date, currencyId: number) {
    if (dexPrice && date) return new GetPriceByDexResponseDto(dexPrice, moment(date).utc(true).toDate());
    else {
      const requestedPriceSample = await getPrice(manager, date, currencyId);
      dexPrice = requestedPriceSample ? requestedPriceSample[exchangesNameMapping[Exchanges.CMC.toUpperCase()]] : undefined;
      if (!dexPrice) throw new BadRequestException(`Could not get price for dex ${Exchanges.CMC} date: ${date}`);
      return new GetPriceByDexResponseDto(dexPrice, moment(requestedPriceSample.timestamp).utc(true).toDate());
    }
  }

  async validateGetPriceResponse(manager: EntityManager, price: string, date: Date, currency: CurrenciesEntity, dex?: Exchanges) {
    if (dex && dex !== Exchanges.CMC && !price) throw new BadRequestException(`Price for currency:${currency.symbol} dex: ${dex} not exists.`);
    if (!dex || dex === Exchanges.CMC) {
      if (!price) {
        return manager.transaction(async entityManager => {
          await getAppStateByName(entityManager, AppStateNames.GET_PRICE_LOCK, true);
          const requestedPriceSample = await getPrice(entityManager, date, currency.id);
          if (requestedPriceSample) return requestedPriceSample;
          const [getCurrentPriceError, getCurrentPrice] = await exec(getExchangeRate(this.configService, currency.symbol, date, dex));
          if (getCurrentPriceError) throw getCurrentPriceError;
          if (getCurrentPrice?.sources?.coinMarketCap) {
            const [saveError] = await exec(insertPricesToDb(entityManager, getCurrentPrice, currency, date));
            if (saveError) throw saveError;
          } else throw new BadRequestException(`Could not get price for currency ${currency.symbol} date: ${date}`);
        });
      }
    }
  }
}
