import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { USERNAME_PATTERN } from '../../common/utils/security';

const USERNAME_MESSAGE = 'نام کاربری باید ۳ تا ۳۲ نویسه و فقط شامل حروف انگلیسی، رقم، نقطه، خط تیره یا زیرخط باشد.';

export class CreateUserDto {
  @IsString({ message: USERNAME_MESSAGE })
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString({ message: 'نام و نام خانوادگی الزامی است.' })
  @Length(3, 120, { message: 'نام و نام خانوادگی باید بین ۳ تا ۱۲۰ نویسه باشد.' })
  fullName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-() ]{0,30}$/, { message: 'شماره تماس معتبر نیست.' })
  phone?: string;

  @IsUUID('4', { message: 'نقش انتخاب‌شده معتبر نیست.' })
  roleId!: string;

  @IsString({ message: 'رمز عبور الزامی است.' })
  @Length(10, 128, { message: 'رمز عبور باید بین ۱۰ تا ۱۲۸ نویسه باشد.' })
  password!: string;

  @IsOptional()
  @IsBoolean({ message: 'وضعیت فعال بودن کاربر معتبر نیست.' })
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username?: string;

  @IsOptional()
  @IsString()
  @Length(3, 120, { message: 'نام و نام خانوادگی باید بین ۳ تا ۱۲۰ نویسه باشد.' })
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'شماره تماس حداکثر ۳۰ نویسه است.' })
  phone?: string;

  @IsOptional()
  @IsUUID('4', { message: 'نقش انتخاب‌شده معتبر نیست.' })
  roleId?: string;

  @IsOptional()
  @IsBoolean({ message: 'وضعیت فعال بودن کاربر معتبر نیست.' })
  isActive?: boolean;

  @Type(() => Number)
  @IsInt({ message: 'نسخه رکورد الزامی است.' })
  @Min(1)
  version!: number;
}

export class ResetPasswordDto {
  @IsString({ message: 'رمز عبور الزامی است.' })
  @Length(10, 128, { message: 'رمز عبور باید بین ۱۰ تا ۱۲۸ نویسه باشد.' })
  newPassword!: string;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'وضعیت کاربر معتبر نیست.' })
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
