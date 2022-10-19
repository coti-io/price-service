import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

export function validate() {
  return ConfigModule.forRoot({
    isGlobal: true,
    validationSchema: Joi.object({
      DB_PRICE_HOST: Joi.string().exist(),
      DB_PRICE_PORT: Joi.number().exist(),
      DB_PRICE_USER: Joi.string().exist(),
      DB_PRICE_PASSWORD: Joi.string().exist(),
      DB_PRICE_NAME: Joi.string().exist(),
      INTERVAL_PRICE_FREQUENCY_IN_SECONDS: Joi.string().default('30'),
      INTERVAL_PRICE_FILL_GAP_FREQUENCY_IN_SECONDS: Joi.string().default('3600'),
      INTERVAL_FILL_GAP_ENABLE: Joi.boolean().default(false),
      CMC_API_KEY: Joi.string().exist(),
    }),
    validationOptions: {
      allowUnknown: true,
      abortEarly: true,
    },
  });
}
