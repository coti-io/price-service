import { CotiPriceRate } from '@coti-io/coti-price-rate';
import { ConfigService } from '@nestjs/config';
import { exec } from './promise-helper';
import { CurrenciesEntity, isPriceExistsInDate, PriceSampleEntity } from '../entities';
import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import moment from 'moment';
import { TableNames } from '../enums';

const logger = new Logger('helpers');

export enum Exchanges {
  BINANCE = 'binance',
  KUCOIN = 'kuCoin',
  CMC = 'cmc',
  COINBASE = 'coinBase',
  CRYPTOCOM = 'cryptoCom',
}

export const exchangesNameMapping = {
  BINANCE: 'binance',
  KUCOIN: 'kucoin',
  CMC: 'coinMarketCap',
  COINBASE: 'coinbase',
  CRYPTOCOM: 'crypto',
};

export const CurrencySymbols = {
  COTI: { BINANCE: 'COTIUSDT', CRYPTOCOM: 'cotiusdc', COINBASE: 'COTI-USD', KUCOIN: 'COTI-USDT', COIN_MARKET_CAP: 'COTI' },
  ETH: { BINANCE: 'ETHUSDT', CRYPTOCOM: 'ethusdc', COINBASE: 'ETH-USD', KUCOIN: 'ETH-USDT', COIN_MARKET_CAP: 'ETH' },
  GCOTI: { BINANCE: 'GCOTIUSDT', CRYPTOCOM: 'gcotiusdc', COINBASE: 'GCOTI-USD', KUCOIN: 'GCOTI-USTD', COIN_MARKET_CAP: 'GCOTI' },
};

export enum CurrencyTypes {
  ETH = 'ETH',
  COTI = 'COTI',
  GCOTI = 'GCOTI',
}

export async function getExchangeRate(configService: ConfigService, currency: CurrencyTypes, date?: Date, dex?: Exchanges) {
  const logger = new Logger('Helpers.getExchangeRate');
  const apiKey = configService.get<string>('CMC_API_KEY');
  const priceRate = new CotiPriceRate(apiKey);
  const rateTime = date ? date.getTime() / 1000 - 90 : undefined;
  let exchangeRateTime: number | undefined;
  if (rateTime) {
    exchangeRateTime = rateTime - (rateTime % 300);
    logger.log(`Getting exchange rate for timestamp ${exchangeRateTime}`);
  }
  let sources = [];
  if (dex === Exchanges.CMC) {
    sources = [priceRate.getCoinMarketCapPriceV2(CurrencySymbols[currency].COIN_MARKET_CAP, date?.getTime()).then(res => ({ exchangeName: 'cmc', price: res }))];
  } else {
    sources = [
      priceRate.getBinancePrice(CurrencySymbols[currency].BINANCE).then(res => ({ exchangeName: Exchanges.BINANCE, price: res })),
      priceRate.getCryptoComPrice(CurrencySymbols[currency].CRYPTOCOM).then(res => ({ exchangeName: Exchanges.CRYPTOCOM, price: res })),
      priceRate.getCoinBasePrice(CurrencySymbols[currency].COINBASE).then(res => ({ exchangeName: Exchanges.COINBASE, price: res })),
      priceRate.getKuCoinPrice(CurrencySymbols[currency].KUCOIN).then(res => ({ exchangeName: Exchanges.KUCOIN, price: res })),
      priceRate.getCoinMarketCapPriceV2(CurrencySymbols[currency].COIN_MARKET_CAP, exchangeRateTime).then(res => ({ exchangeName: 'cmc', price: res })),
    ];
  }
  const prices = await Promise.allSettled<{ exchangeName: string; price: number }>(sources);
  const successPrices = prices.filter(x => x.status === 'fulfilled').map(x => x as PromiseFulfilledResult<{ exchangeName: string; price: number }>);
  const failedPrices = prices.filter(x => x.status === 'rejected').map(x => x as PromiseRejectedResult);
  failedPrices.forEach(failedPrice => logger.error(failedPrice.reason?.config?.url + ':' + failedPrice.reason.message));

  const binance = successPrices.find(price => price.value.exchangeName === Exchanges.BINANCE)?.value?.price;
  const crypto = successPrices.find(price => price.value.exchangeName === Exchanges.CRYPTOCOM)?.value?.price;
  const coinbase = successPrices.find(price => price.value.exchangeName === Exchanges.COINBASE)?.value?.price;
  const kucoin = successPrices.find(price => price.value.exchangeName === Exchanges.KUCOIN)?.value?.price;
  const coinMarketCap = successPrices.find(price => price.value.exchangeName === Exchanges.CMC)?.value?.price;

  return {
    sources: { binance, crypto, coinbase, kucoin, coinMarketCap },
    avg: calculateAverage([binance, crypto, coinbase, kucoin, coinMarketCap]),
  };
}

const calculateAverage = (array: number[]): number => {
  const filteredArray = array.filter(n => n > 0);
  return filteredArray.reduce((avg, value, _, { length }) => {
    return avg + value / length;
  }, 0);
};

export const insertPricesToDb = async (transactionalEntityManager: EntityManager, cotiExchangeRate, currency: CurrenciesEntity, date: Date) => {
  const exists = await isPriceExistsInDate(transactionalEntityManager, currency.id, date);
  if (exists) return;
  const [exchangeError] = await exec(
    transactionalEntityManager
      .getRepository<PriceSampleEntity>(TableNames.PRICE_SAMPLES)
      .createQueryBuilder()
      .insert()
      .into<PriceSampleEntity>(TableNames.PRICE_SAMPLES)
      .values({
        timestamp: moment(date).startOf('minute').toDate(),
        currencyId: currency.id,
        binance: parseFloat(String(cotiExchangeRate.sources.binance || 0)),
        kucoin: parseFloat(String(cotiExchangeRate.sources.kucoin || 0)),
        coinbase: parseFloat(String(cotiExchangeRate.sources.coinbase || 0)),
        crypto: parseFloat(String(cotiExchangeRate.sources.crypto || 0)),
        coinMarketCap: parseFloat(String(cotiExchangeRate.sources.coinMarketCap || 0)),
        average: parseFloat(String(cotiExchangeRate.avg || 0)),
      })
      .execute(),
  );

  if (exchangeError) {
    logger.error(exchangeError);
    throw exchangeError;
  }
};

export function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}
