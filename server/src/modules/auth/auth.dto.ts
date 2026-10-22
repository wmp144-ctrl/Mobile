import { IsString, Length, Matches, MaxLength } from 'class-validator';
import { USERNAME_PATTERN } from '../../common/utils/security';

const USERNAME_MESSAGE = 'نام کاربری باید ۳ تا ۳۲ نویسه و فقط شامل حروف انگلیسی، رقم، نقطه، خط تیره یا زیرخط باشد.';

export class LoginDto {
  @IsString({ message: 'نام کاربری را وارد کنید.' })
  @Length(3, 32, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString({ message: 'رمز عبور را وارد کنید.' })
  @Length(1, 128, { message: 'رمز عبور حداکثر ۱۲۸ نویسه است.' })
  password!: string;
}

export class SetupDto {
  @IsString({ message: 'نام کارگاه را وارد کنید.' })
  @Length(2, 120, { message: 'نام کارگاه باید بین ۲ تا ۱۲۰ نویسه باشد.' })
  workshopName!: string;

  @IsString({ message: 'نام و نام خانوادگی مدیر را وارد کنید.' })
  @Length(3, 120, { message: 'نام و نام خانوادگی باید بین ۳ تا ۱۲۰ نویسه باشد.' })
  fullName!: string;

  @IsString({ message: 'نام کاربری را وارد کنید.' })
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString({ message: 'رمز عبور را وارد کنید.' })
  @Length(10, 128, { message: 'رمز عبور باید بین ۱۰ تا ۱۲۸ نویسه باشد.' })
  password!: string;
}

export class ChangePasswordDto {
  @IsString({ message: 'رمز عبور فعلی را وارد کنید.' })
  @Length(1, 128)
  currentPassword!: string;

  @IsString({ message: 'رمز عبور جدید را وارد کنید.' })
  @Length(10, 128, { message: 'رمز عبور جدید باید بین ۱۰ تا ۱۲۸ نویسه باشد.' })
  newPassword!: string;
}

export class UnlockDto {
  @IsString({ message: 'رمز عبور را وارد کنید.' })
  @Length(1, 128, { message: 'رمز عبور حداکثر ۱۲۸ نویسه است.' })
  password!: string;
}

export class LogoutDto {
  @IsString()
  @MaxLength(200)
  reason?: string;
}
