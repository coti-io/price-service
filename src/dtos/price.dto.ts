import { CurrencyTypes, Exchanges } from '../utils';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class PriceDto {
  price: number;

  constructor(price: PriceDto) {
    Object.assign(this, price);
  }
}

export type Prices = {
  [exchangeName in Exchanges]?: { [price: string]: string };
};

export class GetPriceByDexRequestDto {
  @IsEnum(Exchanges)
  dex: Exchanges;
  @IsEnum(CurrencyTypes)
  @IsString()
  currency: CurrencyTypes;
  @Type(() => Date)
  @IsDate()
  date: Date;
}

export class GetPriceByDexResponseDto {
  price: string;
  date: Date;

  constructor(price: string, date: Date) {
    this.price = price;
    this.date = date;
  }
}

export class GetPriceRequestDto {
  @IsEnum(CurrencyTypes)
  @IsString()
  currency: CurrencyTypes;
  @Type(() => Date)
  @IsDate()
  date: Date;
}

export class GetPriceResponseDto {
  prices: Prices;
  date: Date;

  constructor(prices: Prices, date: Date) {
    this.prices = prices;
    this.date = date;
  }
}

export class PriceReqDto {
  @IsEnum(Exchanges)
  @IsOptional()
  dex: Exchanges;
  @IsString()
  @IsOptional()
  currency = CurrencyTypes.COTI;
  @Type(() => Date)
  @IsDate()
  date: Date;
}
