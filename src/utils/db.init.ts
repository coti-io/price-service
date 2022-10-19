import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppStateEntity, CurrenciesEntity, PriceSampleEntity } from '../entities';

export enum DbNames {
  PRICE_MONITOR = 'price_monitor',
}

export function cotiPriceDbInit() {
  return TypeOrmModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    name: DbNames.PRICE_MONITOR,
    useFactory: (configService: ConfigService) => ({
      name: DbNames.PRICE_MONITOR,
      type: 'mysql',
      host: configService.get<string>('DB_PRICE_HOST'),
      port: configService.get<number>('DB_PRICE_PORT'),
      username: configService.get<string>('DB_PRICE_USER'),
      password: configService.get<string>('DB_PRICE_PASSWORD'),
      database: configService.get<string>('DB_PRICE_NAME'),
      entities: [PriceSampleEntity, CurrenciesEntity, AppStateEntity],
      logging: false,
      connectTimeout: 60 * 60 * 1000,
      acquireTimeout: 60 * 60 * 1000,
      timeout: 60 * 60 * 1000,
      timezone: 'Z',
    }),
  });
}
