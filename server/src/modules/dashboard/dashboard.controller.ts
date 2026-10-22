import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  overview(@CurrentUser() user: AuthUser) {
    return this.dashboard.overview().then((data) => ({
      ...data,
      currentUser: {
        fullName: user.fullName,
        roleNameFa: user.roleNameFa,
      },
    }));
  }
}
