import { Body, Controller, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { CreateCurrencyRequestDto, CreateCurrencyResponseDto, GetPriceByDexRequestDto, GetPriceByDexResponseDto, GetPriceRequestDto, GetPriceResponseDto } from './dtos';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('create-currency')
  async createCurrency(@Body() createCurrencyRequest: CreateCurrencyRequestDto): Promise<CreateCurrencyResponseDto> {
    return this.appService.createCurrency(createCurrencyRequest);
  }

  @Post('price-by-dex')
  async getPriceByDex(@Body() getPriceByDex: GetPriceByDexRequestDto): Promise<GetPriceByDexResponseDto> {
    return this.appService.getPriceByDex(getPriceByDex);
  }

  @Post('price-all-sources')
  async getPriceAllSources(@Body() getPriceRequest: GetPriceRequestDto): Promise<GetPriceResponseDto> {
    return this.appService.getPriceFromAllSources(getPriceRequest);
  }
}
