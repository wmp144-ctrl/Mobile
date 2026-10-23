import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LOCK_STATUS_KEYS, OPERATION_RESULTS } from '../../common/device-status';
import { EmptyToUndefined } from '../../common/validation/validation';

/** وضعیت‌های پیش‌فرض و سفارشی؛ اعتبارسنجی کامل در سرویس انجام می‌شود. */
const STATUS_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const STATUS_KEY_MESSAGE = 'وضعیت انتخاب‌شده معتبر نیست.';
const RESULT_KEYS = OPERATION_RESULTS.map((result) => result.key);
const SORT_FIELDS = [
  'intakeCode',
  'receivedAt',
  'dueAt',
  'status',
  'owner',
  'equipmentType',
  'manufacturer',
  'model',
  'updatedAt',
] as const;

export class ListDevicesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Matches(STATUS_KEY_PATTERN, { message: STATUS_KEY_MESSAGE })
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  equipmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  manufacturer?: string;

  @IsOptional()
  @IsUUID('4', { message: 'شناسه تکنسین معتبر نیست.' })
  technicianId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'شناسه مشتری معتبر نیست.' })
  customerId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'بازه تاریخ پذیرش معتبر نیست.' })
  receivedFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'بازه تاریخ پذیرش معتبر نیست.' })
  receivedTo?: string;

  @IsOptional()
  @IsIn(SORT_FIELDS, { message: 'ستون مرتب‌سازی معتبر نیست.' })
  sortBy?: (typeof SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

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

export class DuplicateCheckQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  imei1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  imei2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @IsOptional()
  @IsUUID('4')
  excludeId?: string;
}

export class CreateDeviceDto {
  @IsUUID('4', { message: 'مشتری انتخاب‌شده معتبر نیست.' })
  customerId!: string;

  @IsString()
  @MinLength(2, { message: 'نام آورنده حداقل ۲ نویسه است.' })
  @MaxLength(120, { message: 'نام آورنده حداکثر ۱۲۰ نویسه است.' })
  broughtByName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'شغل آورنده حداکثر ۶۰ نویسه است.' })
  broughtByJob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'شماره تماس آورنده حداکثر ۳۰ نویسه است.' })
  broughtByPhone?: string;

  @IsString()
  @MinLength(1, { message: 'نوع تجهیز را انتخاب کنید.' })
  @MaxLength(40)
  equipmentType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'مدل دستگاه حداکثر ۱۲۰ نویسه است.' })
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'شماره سریال حداکثر ۸۰ نویسه است.' })
  serialNumber?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Matches(/^\d{15}$/, { message: 'IMEI 1 باید دقیقاً ۱۵ رقم باشد.' })
  imei1?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Matches(/^\d{15}$/, { message: 'IMEI 2 باید دقیقاً ۱۵ رقم باشد.' })
  imei2?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString({}, { message: 'زمان دریافت دستگاه معتبر نیست.' })
  receivedAt?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString({}, { message: 'تاریخ تحویل پیش‌بینی‌شده معتبر نیست.' })
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'وضعیت ظاهری حداکثر ۲۰۰۰ نویسه است.' })
  physicalCondition?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'حداکثر ۲۰ قلم لوازم همراه قابل ثبت است.' })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  accessories?: string[];

  @IsOptional()
  @EmptyToUndefined()
  @IsIn([...LOCK_STATUS_KEYS], { message: 'وضعیت قفل دستگاه معتبر نیست.' })
  lockStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'رمز دستگاه حداکثر ۱۲۰ نویسه است.' })
  devicePassword?: string;

  @IsString()
  @MinLength(3, { message: 'مشکل اعلام‌شده حداقل ۳ نویسه است.' })
  @MaxLength(2000, { message: 'مشکل اعلام‌شده حداکثر ۲۰۰۰ نویسه است.' })
  reportedProblem!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'توضیحات حداکثر ۲۰۰۰ نویسه است.' })
  notes?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'تکنسین انتخاب‌شده معتبر نیست.' })
  technicianId?: string;

  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;

  @IsOptional()
  @IsObject({ message: 'مقادیر فیلدهای سفارشی معتبر نیست.' })
  customFields?: Record<string, unknown>;
}

export class UpdateDeviceDto extends CreateDeviceDto {
  @Type(() => Number)
  @IsInt({ message: 'شماره نسخه رکورد معتبر نیست.' })
  @Min(1)
  version!: number;

  @IsOptional()
  @IsBoolean()
  clearDevicePassword?: boolean;
}

export class ChangeDeviceStatusDto {
  @Matches(STATUS_KEY_PATTERN, { message: STATUS_KEY_MESSAGE })
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'توضیح تغییر وضعیت حداکثر ۵۰۰ نویسه است.' })
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class CreateOperationDto {
  @IsString()
  @MinLength(1, { message: 'نوع اقدام را انتخاب کنید.' })
  @MaxLength(40)
  operationType!: string;

  @IsString()
  @MinLength(2, { message: 'عنوان اقدام حداقل ۲ نویسه است.' })
  @MaxLength(160, { message: 'عنوان اقدام حداکثر ۱۶۰ نویسه است.' })
  title!: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsDateString({}, { message: 'تاریخ انجام اقدام معتبر نیست.' })
  performedAt?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'تکنسین انتخاب‌شده معتبر نیست.' })
  technicianId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'توضیحات اقدام حداکثر ۲۰۰۰ نویسه است.' })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'حجم اطلاعات باید عدد صحیح (بایت) باشد.' })
  @Min(0)
  @Max(1_000_000_000_000_000)
  dataSizeBytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'محل ذخیره فایل حداکثر ۵۰۰ نویسه است.' })
  storagePath?: string;

  @IsOptional()
  @IsIn(RESULT_KEYS, { message: 'نتیجه اقدام معتبر نیست.' })
  result?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Matches(STATUS_KEY_PATTERN, { message: 'وضعیت نهایی معتبر نیست.' })
  deviceStatusAfter?: string;
}

export class UpdateOperationDto extends CreateOperationDto {
  @Type(() => Number)
  @IsInt({ message: 'شماره نسخه رکورد معتبر نیست.' })
  @Min(1)
  version!: number;
}

export class CreateDeviceFileDto {
  @IsString()
  @MinLength(2, { message: 'عنوان فایل حداقل ۲ نویسه است.' })
  @MaxLength(120, { message: 'عنوان فایل حداکثر ۱۲۰ نویسه است.' })
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'مسیر فایل حداکثر ۵۰۰ نویسه است.' })
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400, { message: 'مسیر نسبی حداکثر ۴۰۰ نویسه است.' })
  relativePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'مسیر کلاینتی حداکثر ۵۰۰ نویسه است.' })
  clientPath?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'محل ذخیره‌سازی معتبر نیست.' })
  storageLocationId?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['network', 'local', 'external'], { message: 'نوع محل ذخیره معتبر نیست.' })
  storageKind?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['root', 'original', 'backup', 'recovered', 'report', 'image', 'document', 'other'], {
    message: 'دسته‌بندی فایل معتبر نیست.',
  })
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'حجم فایل باید عدد صحیح (بایت) باشد.' })
  @Min(0)
  @Max(1_000_000_000_000_000)
  sizeBytes?: number;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(['none', 'pending', 'in_progress', 'completed', 'failed'], {
    message: 'وضعیت بکاپ معتبر نیست.',
  })
  backupStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'مسیر جایگزین حداکثر ۵۰۰ نویسه است.' })
  alternativePath?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUUID('4', { message: 'اقدام مرتبط معتبر نیست.' })
  relatedOperationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'یادداشت حداکثر ۵۰۰ نویسه است.' })
  notes?: string;
}

export class UpdateDeviceFileDto extends CreateDeviceFileDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'شماره نسخه رکورد معتبر نیست.' })
  @Min(1)
  version?: number;
}

export class CreateDeviceNoteDto {
  @IsString()
  @MinLength(1, { message: 'متن یادداشت الزامی است.' })
  @MaxLength(2000, { message: 'یادداشت حداکثر ۲۰۰۰ نویسه است.' })
  body!: string;
}

export class UploadDeviceImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'توضیح تصویر حداکثر ۲۰۰ نویسه است.' })
  caption?: string;
}
