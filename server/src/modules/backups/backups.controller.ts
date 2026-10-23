import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import type { AuthUser } from '../users/user.types';
import { BackupsService, type DownloadableFile } from './backups.service';

class CreateBackupDto {
  @IsOptional()
  @IsBoolean()
  includeFiles?: boolean;
}

class RestoreBackupDto {
  @IsString({ message: 'نام نسخه پشتیبان برای تأیید الزامی است.' })
  @MaxLength(80)
  confirmName!: string;

  @IsOptional()
  @IsBoolean()
  restoreDatabase?: boolean;

  @IsOptional()
  @IsBoolean()
  restoreSettings?: boolean;

  @IsOptional()
  @IsBoolean()
  restoreFiles?: boolean;
}

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
  create(@Body() dto: CreateBackupDto, @CurrentUser() user: AuthUser) {
    return this.backups.create({ id: user.id, username: user.username }, 'manual', {
      includeFiles: dto.includeFiles,
    });
  }

  @Get(':name/download')
  @RequirePermissions(PERMISSIONS.BACKUPS_MANAGE)
  async download(
    @Param('name') name: string,
    @Query('file') file: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const allowed: DownloadableFile[] = ['database', 'settings', 'manifest'];
    const selected = (file ?? 'database') as DownloadableFile;
    if (!allowed.includes(selected)) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'نوع فایل درخواستی معتبر نیست.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const result = await this.backups.resolveDownload(name, selected, {
      id: user.id,
      username: user.username,
    });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    const stream = createReadStream(result.streamPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
      }
    });
    stream.pipe(res);
  }

  @Post(':name/restore')
  @RequirePermissions(PERMISSIONS.BACKUPS_MANAGE)
  async restore(
    @Param('name') name: string,
    @Body() dto: RestoreBackupDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (dto.confirmName.trim() !== name) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        'نام نسخه پشتیبان برای تأیید مطابقت ندارد.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.backups.restore(
      name,
      { id: user.id, username: user.username },
      {
        restoreDatabase: dto.restoreDatabase,
        restoreSettings: dto.restoreSettings,
        restoreFiles: dto.restoreFiles,
      },
    );
  }
}
