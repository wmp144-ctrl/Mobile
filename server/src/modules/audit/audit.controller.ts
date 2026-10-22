import { Controller, Get, Query } from '@nestjs/common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }

  @Get('actions')
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  actions() {
    return this.audit.actionSummary();
  }
}
