import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { appModuleConfig } from './configurations';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, appModuleConfig);
  const config = new DocumentBuilder()
    .setTitle('Price service')
    .setDescription('The price service is a monitor for price of coti & eth.  \n' + 'in addition the service has an api to get price by given date from multiple sources.')
    .setVersion('1.0')
    .build();

  app.enableCors();
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );
  const configService = app.get<ConfigService>(ConfigService);
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  const port = configService.get<number>('PORT') || '3000';
  await app.listen(port);
}
bootstrap();
