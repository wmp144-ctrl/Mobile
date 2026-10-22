import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @Length(2, 120, { message: 'نام مشتری باید بین ۲ تا ۱۲۰ نویسه باشد.' })
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'شماره تماس حداکثر ۳۰ نویسه است.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'شماره تماس دوم حداکثر ۳۰ نویسه است.' })
  phoneSecondary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'عنوان شغل حداکثر ۶۰ نویسه است.' })
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'کد ملی حداکثر ۲۰ نویسه است.' })
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'آدرس حداکثر ۳۰۰ نویسه است.' })
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'یادداشت حداکثر ۱۰۰۰ نویسه است.' })
  notes?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @Type(() => Number)
  @IsInt({ message: 'شماره نسخه رکورد معتبر نیست.' })
  @Min(1)
  version!: number;
}

export class ListCustomersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

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
