import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EmptyToUndefined } from '../../common/validation/validation';

const LOCATION_KINDS = ['server', 'nas', 'external'] as const;
const BACKUP_STATUSES = ['none', 'pending', 'in_progress', 'completed', 'failed'] as const;
const ACCESS_STATUSES = ['unknown', 'ok', 'missing', 'unavailable'] as const;
const SAFE_FOLDER_NAME = /^(?!.*\.\.)(?!.*[<>:"/\\|?*\u0000-\u001F]).{1,40}$/;
const SAFE_LAYOUT = /^(?!.*\.\.)(?=.*\{intakeCode\})[A-Za-z0-9_{}\-/\\ ]+$/;

export class ListStorageFilesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID('4', { message: 'شناسه دستگاه معتبر نیست.' })
  deviceId?: string;

  @IsOptional()
  @IsIn(BACKUP_STATUSES, { message: 'وضعیت بکاپ معتبر نیست.' })
  backupStatus?: string;

  @IsOptional()
  @IsIn(ACCESS_STATUSES, { message: 'وضعیت دسترسی معتبر نیست.' })
  accessStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateStorageLocationDto {
  @IsString()
  @MinLength(2, { message: 'نام محل ذخیره‌سازی حداقل ۲ نویسه است.' })
  @MaxLength(120, { message: 'نام محل ذخیره‌سازی حداکثر ۱۲۰ نویسه است.' })
  name!: string;

  @IsString()
  @MinLength(1, { message: 'مسیر ریشه الزامی است.' })
  @MaxLength(500, { message: 'مسیر ریشه حداکثر ۵۰۰ نویسه است.' })
  rootPath!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'مسیر کلاینتی حداکثر ۵۰۰ نویسه است.' })
  clientRoot?: string;

  @IsOptional()
  @IsIn(LOCATION_KINDS, { message: 'نوع محل ذخیره‌سازی معتبر نیست.' })
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10, { message: 'نام درایو حداکثر ۱۰ نویسه است.' })
  driveLetter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'برچسب حافظه حداکثر ۸۰ نویسه است.' })
  volumeLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'شناسه حافظه حداکثر ۱۲۰ نویسه است.' })
  volumeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'نام میزبان/سرور حداکثر ۱۲۰ نویسه است.' })
  hostName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'یادداشت حداکثر ۵۰۰ نویسه است.' })
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStorageLocationDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'نام محل ذخیره‌سازی حداقل ۲ نویسه است.' })
  @MaxLength(120, { message: 'نام محل ذخیره‌سازی حداکثر ۱۲۰ نویسه است.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'مسیر ریشه الزامی است.' })
  @MaxLength(500, { message: 'مسیر ریشه حداکثر ۵۰۰ نویسه است.' })
  rootPath?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(500, { message: 'مسیر کلاینتی حداکثر ۵۰۰ نویسه است.' })
  clientRoot?: string;

  @IsOptional()
  @IsIn(LOCATION_KINDS, { message: 'نوع محل ذخیره‌سازی معتبر نیست.' })
  kind?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(10, { message: 'نام درایو حداکثر ۱۰ نویسه است.' })
  driveLetter?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(80, { message: 'برچسب حافظه حداکثر ۸۰ نویسه است.' })
  volumeLabel?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(120, { message: 'شناسه حافظه حداکثر ۱۲۰ نویسه است.' })
  volumeId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(120, { message: 'نام میزبان/سرور حداکثر ۱۲۰ نویسه است.' })
  hostName?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(500, { message: 'یادداشت حداکثر ۵۰۰ نویسه است.' })
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Type(() => Number)
  @IsInt({ message: 'شماره نسخه رکورد معتبر نیست.' })
  @Min(1)
  version!: number;
}

export class StorageConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'الگوی ساختار پوشه حداکثر ۱۲۰ نویسه است.' })
  @Matches(SAFE_LAYOUT, {
    message: 'الگوی پوشه فقط می‌تواند شامل {year}، {intakeCode}، حروف انگلیسی، رقم و خط تیره باشد.',
  })
  folderLayout?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'حداکثر ۱۲ زیرپوشه قابل تعریف است.' })
  @IsString({ each: true })
  @Matches(SAFE_FOLDER_NAME, {
    each: true,
    message: 'نام زیرپوشه باید بین ۱ تا ۴۰ نویسه و بدون نویسه‌های غیرمجاز باشد.',
  })
  subfolders?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'آستانه هشدار فضای آزاد باید عدد صحیح باشد.' })
  @Min(1)
  @Max(100000)
  lowSpaceGb?: number;
}

export class OpenTicketQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;
}
