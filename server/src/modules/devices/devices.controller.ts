import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../users/user.types';
import {
  ChangeDeviceStatusDto,
  CreateDeviceDto,
  CreateDeviceFileDto,
  CreateDeviceNoteDto,
  CreateOperationDto,
  DuplicateCheckQueryDto,
  ListDevicesQueryDto,
  UpdateDeviceDto,
  UpdateDeviceFileDto,
  UpdateOperationDto,
  UploadDeviceImageDto,
} from './devices.dto';
import { DevicesService, type UploadedImageFile } from './devices.service';

const uuidPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  list(@Query() query: ListDevicesQueryDto) {
    return this.devices.list(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  async export(
    @Query() query: ListDevicesQueryDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.devices.exportExcel(query, { id: user.id, username: user.username });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  }

  @Get('duplicates')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  duplicates(@Query() query: DuplicateCheckQueryDto) {
    return this.devices.duplicates(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  get(@Param('id', uuidPipe) id: string) {
    return this.devices.getDetail(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  create(@Body() dto: CreateDeviceDto, @CurrentUser() user: AuthUser) {
    return this.devices.create(dto, { id: user.id, username: user.username });
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  update(
    @Param('id', uuidPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.update(id, dto, { id: user.id, username: user.username });
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  changeStatus(
    @Param('id', uuidPipe) id: string,
    @Body() dto: ChangeDeviceStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.changeStatus(id, dto, { id: user.id, username: user.username });
  }

  @Get(':id/password')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  revealPassword(@Param('id', uuidPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.devices.revealPassword(id, { id: user.id, username: user.username });
  }

  @Post(':id/operations')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  addOperation(
    @Param('id', uuidPipe) id: string,
    @Body() dto: CreateOperationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.addOperation(id, dto, { id: user.id, username: user.username });
  }

  @Patch(':id/operations/:operationId')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  updateOperation(
    @Param('id', uuidPipe) id: string,
    @Param('operationId', uuidPipe) operationId: string,
    @Body() dto: UpdateOperationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.updateOperation(id, operationId, dto, {
      id: user.id,
      username: user.username,
    });
  }

  @Delete(':id/operations/:operationId')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  removeOperation(
    @Param('id', uuidPipe) id: string,
    @Param('operationId', uuidPipe) operationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.removeOperation(id, operationId, {
      id: user.id,
      username: user.username,
    });
  }

  @Post(':id/files')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  addFile(
    @Param('id', uuidPipe) id: string,
    @Body() dto: CreateDeviceFileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.addFile(id, dto, { id: user.id, username: user.username });
  }

  @Patch(':id/files/:fileId')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  updateFile(
    @Param('id', uuidPipe) id: string,
    @Param('fileId', uuidPipe) fileId: string,
    @Body() dto: UpdateDeviceFileDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.updateFile(id, fileId, dto, { id: user.id, username: user.username });
  }

  @Delete(':id/files/:fileId')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  removeFile(
    @Param('id', uuidPipe) id: string,
    @Param('fileId', uuidPipe) fileId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.removeFile(id, fileId, { id: user.id, username: user.username });
  }

  @Post(':id/notes')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  addNote(
    @Param('id', uuidPipe) id: string,
    @Body() dto: CreateDeviceNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.addNote(id, dto.body, { id: user.id, username: user.username });
  }

  @Delete(':id/notes/:noteId')
  @RequirePermissions(PERMISSIONS.REPAIRS_MANAGE)
  removeNote(
    @Param('id', uuidPipe) id: string,
    @Param('noteId', uuidPipe) noteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.removeNote(id, noteId, { id: user.id, username: user.username });
  }

  @Post(':id/images')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          callback(
            new BadRequestException('فقط تصویر با قالب JPG، PNG، WEBP یا GIF قابل بارگذاری است.'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadImage(
    @Param('id', uuidPipe) id: string,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: UploadDeviceImageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.addImage(id, file, dto.caption, {
      id: user.id,
      username: user.username,
    });
  }

  @Get(':id/images/:imageId/file')
  @RequirePermissions(PERMISSIONS.REPAIRS_VIEW)
  async imageFile(
    @Param('id', uuidPipe) id: string,
    @Param('imageId', uuidPipe) imageId: string,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.devices.resolveImage(id, imageId);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(image.filePath);
  }

  @Delete(':id/images/:imageId')
  @RequirePermissions(PERMISSIONS.FILES_MANAGE)
  removeImage(
    @Param('id', uuidPipe) id: string,
    @Param('imageId', uuidPipe) imageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.devices.removeImage(id, imageId, { id: user.id, username: user.username });
  }
}
