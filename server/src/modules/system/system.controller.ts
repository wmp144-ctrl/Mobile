import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SystemService } from './system.service';

@Controller()
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Public()
  @Get('public/info')
  info() {
    return this.system.publicInfo();
  }

  @Public()
  @Get('health')
  health() {
    return this.system.health();
  }
}
