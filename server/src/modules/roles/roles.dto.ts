import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { ALL_PERMISSIONS } from '../../common/permissions';

export class CreateRoleDto {
  @IsString({ message: 'نام نقش الزامی است.' })
  @Length(3, 80, { message: 'نام نقش باید بین ۳ تا ۸۰ نویسه باشد.' })
  nameFa!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'توضیحات حداکثر ۳۰۰ نویسه است.' })
  description?: string;

  @IsArray({ message: 'فهرست مجوزها باید آرایه باشد.' })
  @ArrayMinSize(1, { message: 'حداقل یک مجوز را انتخاب کنید.' })
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'مجوز انتخاب‌شده معتبر نیست.' })
  permissions!: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(3, 80, { message: 'نام نقش باید بین ۳ تا ۸۰ نویسه باشد.' })
  nameFa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'توضیحات حداکثر ۳۰۰ نویسه است.' })
  description?: string;

  @IsOptional()
  @IsArray({ message: 'فهرست مجوزها باید آرایه باشد.' })
  @ArrayMinSize(1, { message: 'حداقل یک مجوز را انتخاب کنید.' })
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'مجوز انتخاب‌شده معتبر نیست.' })
  permissions?: string[];

  @Type(() => Number)
  @IsInt({ message: 'نسخه رکورد الزامی است.' })
  @Min(1)
  version!: number;
}
