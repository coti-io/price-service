import { Column, Entity, EntityManager, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CurrenciesEntity } from './currencies.entity';
import moment from 'moment';
import { exec } from '../utils';
import { TableNames } from '../enums';

@Entity(TableNames.PRICE_SAMPLES)
export class PriceSampleEntity extends BaseEntity {
  @Column()
  timestamp: Date;

  @Column()
  currencyId: number;

  @Column()
  binance: number;

  @Column()
  kucoin: number;

  @Column()
  coinbase: number;

  @Column()
  crypto: number;

  @Column()
  coinMarketCap: number;

  @Column()
  average: number;

  @ManyToOne(() => CurrenciesEntity, currency => currency.priceSamples)
  @JoinColumn({ name: 'currencyId' })
  currency: CurrenciesEntity;
}

export const isPriceExists = async (manager: EntityManager, currencyId: number) => {
  const condition = `DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i') = DATE_FORMAT('${moment()
    .startOf('minute')
    .utc(true)
    .toDate()
    .toISOString()}', '%Y-%m-%d %H:%i') AND currencyId = ${currencyId}`;
  const [error, existsPrice] = await exec(
    manager.getRepository<PriceSampleEntity>(TableNames.PRICE_SAMPLES).findOne({
      where: condition,
    }),
  );
  if (error) throw error;
  return !!existsPrice;
};

export async function getLastCurrencyPrice(manager: EntityManager, currency: CurrenciesEntity) {
  const [lastPriceError, lastPrice] = await exec(
    manager
      .getRepository<PriceSampleEntity>(TableNames.PRICE_SAMPLES)
      .createQueryBuilder('price_samples')
      .where({ currencyId: currency.id })
      .orderBy({ id: 'DESC' })
      .limit(1)
      .getOne(),
  );

  if (lastPriceError) throw lastPriceError;
  return lastPrice;
}

export async function getPrice(manager: EntityManager, date: Date, currencyId: number) {
  const condition = `DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i') = DATE_FORMAT('${moment(date)
    .startOf('minute')
    .utc(true)
    .toDate()
    .toISOString()}', '%Y-%m-%d %H:%i') AND currencyId = ${currencyId}`;
  const [error, price] = await exec(
    manager.getRepository<PriceSampleEntity>(TableNames.PRICE_SAMPLES).findOne({
      where: condition,
    }),
  );
  if (error) throw error;
  return price;
}
