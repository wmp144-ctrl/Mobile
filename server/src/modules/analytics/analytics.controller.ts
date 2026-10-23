import { Controller, Get, Query } from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import { AnalyticsFilterDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  dashboard(@Query() query: AnalyticsFilterDto, @CurrentUser() user: AuthUser) {
    return this.analytics.dashboard(query, user);
  }

  @Get('options')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  options() {
    return this.analytics.options();
  }
}
