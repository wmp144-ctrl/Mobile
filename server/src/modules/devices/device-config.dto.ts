import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OPTION_CATEGORIES } from '../../common/device-status';

const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multi_select',
  'checkbox',
  'password',
] as const;

export class FieldOptionDto {
  @IsString()
  @Length(1, 60)
  value!: string;

  @IsString()
  @Length(1, 80)
  label!: string;
}

export class CreateFieldDto {
  @IsString()
  @Length(2, 60, { message: 'عنوان فیلد باید بین ۲ تا ۶۰ نویسه باشد.' })
  labelFa!: string;

  @IsIn([...FIELD_TYPES], { message: 'نوع فیلد معتبر نیست.' })
  fieldType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'نام گروه حداکثر ۶۰ نویسه است.' })
  groupName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOptionDto)
  options?: FieldOptionDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  @Length(2, 60, { message: 'عنوان فیلد باید بین ۲ تا ۶۰ نویسه باشد.' })
  labelFa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  groupName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeholder?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOptionDto)
  options?: FieldOptionDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class CreateOptionDto {
  @IsIn([...OPTION_CATEGORIES], { message: 'دسته فهرست معتبر نیست.' })
  category!: string;

  @IsString()
  @Length(1, 80, { message: 'عنوان گزینه باید بین ۱ تا ۸۰ نویسه باشد.' })
  labelFa!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateOptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 80, { message: 'عنوان گزینه باید بین ۱ تا ۸۰ نویسه باشد.' })
  labelFa?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
