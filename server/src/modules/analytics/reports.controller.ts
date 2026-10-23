import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import {
  CreateSavedReportDto,
  RunReportDto,
  UpdateSavedReportDto,
} from './analytics.dto';
import { AnalyticsService } from './analytics.service';

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller('reports')
export class ReportsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('options')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  options() {
    return this.analytics.options();
  }

  @Post('run')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  run(@Body() dto: RunReportDto) {
    return this.analytics.run(dto);
  }

  @Get('saved')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  listSaved(@CurrentUser() user: AuthUser) {
    return this.analytics.listSaved(user);
  }

  @Get('saved/:id')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  getSaved(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.analytics.getSaved(id, user);
  }

  @Post('saved')
  @RequirePermissions(PERMISSIONS.REPORTS_MANAGE)
  createSaved(@Body() dto: CreateSavedReportDto, @CurrentUser() user: AuthUser) {
    return this.analytics.createSaved(dto, user);
  }

  @Patch('saved/:id')
  @RequirePermissions(PERMISSIONS.REPORTS_MANAGE)
  updateSaved(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateSavedReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analytics.updateSaved(id, dto, user);
  }

  @Delete('saved/:id')
  @RequirePermissions(PERMISSIONS.REPORTS_MANAGE)
  async deleteSaved(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.analytics.deleteSaved(id, user);
    return { deleted: true };
  }

  @Post('saved/:id/run')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  runSaved(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.analytics.runSaved(id, user);
  }

  @Post('export/excel')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async excel(
    @Body() dto: RunReportDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.analytics.exportExcel(dto, {
      id: user.id,
      username: user.username,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  }

  @Post('export/csv')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  async csv(
    @Body() dto: RunReportDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.analytics.exportCsv(dto, {
      id: user.id,
      username: user.username,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  }
}
