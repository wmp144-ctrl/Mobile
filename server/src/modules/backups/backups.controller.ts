import { Controller, Get, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import type { AuthUser } from '../users/user.types';
import { BackupsService } from './backups.service';

@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BACKUPS_MANAGE)
  list() {
    return this.backups.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BACKUPS_MANAGE)
  create(@CurrentUser() user: AuthUser) {
    return this.backups.create({ id: user.id, username: user.username });
  }

  @Get(':name/download')
  @RequirePermissions(PERMISSIONS.BACKUPS_MANAGE)
  async download(
    @Param('name') name: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.backups.resolveDownload(name, {
      id: user.id,
      username: user.username,
    });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    const stream = createReadStream(file.filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
      }
    });
    stream.pipe(res);
  }
}
