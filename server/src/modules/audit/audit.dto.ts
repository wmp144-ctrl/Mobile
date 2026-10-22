import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'عبارت جستجو حداکثر ۱۰۰ نویسه است.' })
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'تاریخ شروع معتبر نیست.' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'تاریخ پایان معتبر نیست.' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'شماره صفحه باید عدد باشد.' })
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
