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

export const isPriceExistsInDate = async (manager: EntityManager, currencyId: number, date: Date) => {
  const condition = `timestamp='${moment(date).utc(false).startOf('minute').format('YYYY-MM-DD HH:mm:ss.SSS')}' AND currencyId = ${currencyId}`;
  const [error, existsPrice] = await exec(
    manager.getRepository<PriceSampleEntity>(TableNames.PRICE_SAMPLES).findOne({
      where: condition,
    }),
  );
  if (error) throw error;
  return !!existsPrice;
};

export async function getPrice(manager: EntityManager, date: Date, currencyId: number) {
  const condition = `timestamp='${moment(date).utc(false).startOf('minute').format('YYYY-MM-DD HH:mm:ss.SSS')}' AND currencyId = ${currencyId}`;
  const [error, price] = await exec(
    manager.getRepository<PriceSampleEntity>(TableNames.PRICE_SAMPLES).findOne({
      where: condition,
    }),
  );
  if (error) throw error;
  return price;
}
