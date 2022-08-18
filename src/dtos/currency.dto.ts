import { CurrencyTypes } from '../utils';
import { IsDate, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCurrencyRequestDto {
  @IsEnum(CurrencyTypes)
  symbol: CurrencyTypes;

  @Type(() => Date)
  @IsDate()
  monitorFrom: Date;
}

export class CreateCurrencyResponseDto {
  symbol: CurrencyTypes;
  monitorFrom: Date;
}
