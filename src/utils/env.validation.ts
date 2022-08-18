import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

export function validate() {
  return ConfigModule.forRoot({
    isGlobal: true,
    validationSchema: Joi.object({
      DB_COTI_PRICE_HOST: Joi.string().exist(),
      DB_COTI_PRICE_PORT: Joi.number().exist(),
      DB_COTI_PRICE_USER: Joi.string().exist(),
      DB_COTI_PRICE_PASSWORD: Joi.string().exist(),
      DB_COTI_PRICE_NAME: Joi.string().exist(),
      COTI_PRICE_FREQUENCY_IN_SECONDS: Joi.string().default('30'),
      CMC_API_KEY: Joi.string().exist(),
      ENFORCE_FILL_GAP: Joi.boolean().exist(),
    }),
    validationOptions: {
      allowUnknown: true,
      abortEarly: true,
    },
  });
}
