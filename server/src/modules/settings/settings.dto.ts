import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SAFE_FOLDER_NAME = /^(?!.*\.\.)(?!.*[<>:"/\\|?*\u0000-\u001F]).{1,40}$/;

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: 'نام کارگاه باید بین ۲ تا ۱۲۰ نویسه باشد.' })
  workshopName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'آدرس حداکثر ۳۰۰ نویسه است.' })
  workshopAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'شماره تماس حداکثر ۳۰ نویسه است.' })
  workshopPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'مدت قفل خودکار باید عدد صحیح باشد.' })
  @Min(2, { message: 'مدت قفل خودکار حداقل ۲ دقیقه است.' })
  @Max(240, { message: 'مدت قفل خودکار حداکثر ۲۴۰ دقیقه است.' })
  idleTimeoutMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3, { message: 'حداکثر تلاش ناموفق حداقل ۳ است.' })
  @Max(20, { message: 'حداکثر تلاش ناموفق حداکثر ۲۰ است.' })
  maxFailedLogins?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'مدت قفل حساب حداقل ۱ دقیقه است.' })
  @Max(1440, { message: 'مدت قفل حساب حداکثر ۱۴۴۰ دقیقه است.' })
  lockoutMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'مدت اعتبار نشست حداقل ۱ روز است.' })
  @Max(30, { message: 'مدت اعتبار نشست حداکثر ۳۰ روز است.' })
  sessionDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'تعداد نسخه‌های پشتیبان حداقل ۱ است.' })
  @Max(365, { message: 'تعداد نسخه‌های پشتیبان حداکثر ۳۶۵ است.' })
  backupRetentionCount?: number;

  @IsOptional()
  @IsString()
  @Length(1, 8, { message: 'پیشوند کد پذیرش باید بین ۱ تا ۸ نویسه باشد.' })
  @Matches(/^[A-Za-z0-9]+$/, { message: 'پیشوند کد پذیرش فقط شامل حروف انگلیسی و رقم است.' })
  intakePrefix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'مهلت پیش‌فرض تحویل باید عدد صحیح باشد.' })
  @Min(0, { message: 'مهلت پیش‌فرض تحویل نمی‌تواند منفی باشد.' })
  @Max(180, { message: 'مهلت پیش‌فرض تحویل حداکثر ۱۸۰ روز است.' })
  defaultDueDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'الگوی ساختار پوشه حداکثر ۱۲۰ نویسه است.' })
  @Matches(/^(?!.*\.\.)(?=.*\{intakeCode\})[A-Za-z0-9_{}\-/\\ ]+$/, {
    message: 'الگوی پوشه فقط می‌تواند شامل {year}، {intakeCode}، حروف انگلیسی، رقم و خط تیره باشد.',
  })
  storageFolderLayout?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12, { message: 'حداکثر ۱۲ زیرپوشه قابل تعریف است.' })
  @IsString({ each: true })
  @Matches(SAFE_FOLDER_NAME, {
    each: true,
    message: 'نام زیرپوشه باید بین ۱ تا ۴۰ نویسه و بدون نویسه‌های غیرمجاز باشد.',
  })
  storageSubfolders?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'آستانه هشدار فضای آزاد باید عدد صحیح باشد.' })
  @Min(1, { message: 'آستانه هشدار فضای آزاد حداقل ۱ گیگابایت است.' })
  @Max(100000, { message: 'آستانه هشدار فضای آزاد حداکثر ۱۰۰۰۰۰ گیگابایت است.' })
  storageLowSpaceGb?: number;
}
