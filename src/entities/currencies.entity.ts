import { Column, Entity, EntityManager, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CurrencyTypes, exec } from '../utils';
import { CreateCurrencyRequestDto } from '../dtos';
import { BadRequestException } from '@nestjs/common';
import moment from 'moment';
import { PriceSampleEntity } from './price-samples.entity';
import { TableNames } from '../enums';

@Entity(TableNames.CURRENCIES)
export class CurrenciesEntity extends BaseEntity {
  @Column()
  symbol: CurrencyTypes;

  @Column()
  monitorFrom: Date;

  @OneToMany(() => PriceSampleEntity, priceSamples => priceSamples.currency)
  priceSamples: PriceSampleEntity[];
}

export const getCurrencies = async (manager: EntityManager): Promise<CurrenciesEntity[]> => {
  const [error, currencies] = await exec(manager.getRepository<CurrenciesEntity>('currencies').createQueryBuilder().getMany());
  if (error) throw error;
  return currencies;
};

export const getCurrencyBySymbol = async (manager: EntityManager, symbol: CurrencyTypes): Promise<CurrenciesEntity> => {
  const [error, currency] = await exec(
    manager.getRepository<CurrenciesEntity>('currencies').findOne({
      where: { symbol },
    }),
  );
  if (error) throw error;
  return currency;
};

export const createNewCurrency = async (manager: EntityManager, createCurrencyRequest: CreateCurrencyRequestDto) => {
  const existCurrency = await manager.getRepository<CurrenciesEntity>('currencies').findOne({ where: { symbol: createCurrencyRequest.symbol } });
  if (existCurrency) {
    throw new BadRequestException(`Currency ${createCurrencyRequest.symbol} already exists.`);
  }
  const currencyToSave = manager.getRepository<CurrenciesEntity>('currencies').create({
    symbol: createCurrencyRequest.symbol,
    monitorFrom: moment(createCurrencyRequest.monitorFrom).toDate(),
  });
  const [error, savedCurrency] = await exec(manager.getRepository<CurrenciesEntity>('currencies').save(currencyToSave));
  if (error) throw error;
  return savedCurrency;
};
