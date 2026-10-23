import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  REPORT_CHART_TYPES,
  REPORT_DIMENSIONS,
  REPORT_METRICS,
  REPORT_TABLE_COLUMN_PATTERN,
  type ReportChartType,
  type ReportDimension,
  type ReportMetric,
  type ReportTableColumn,
} from './analytics.types';

/** وضعیت‌های پیش‌فرض و سفارشی؛ وضعیت سفارشی با کلید لاتین ذخیره می‌شود. */
const STATUS_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export class AnalyticsFilterDto {
  @IsOptional()
  @IsDateString({}, { message: 'تاریخ شروع بازه معتبر نیست.' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ پایان بازه معتبر نیست.' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300, { message: 'سال شمسی معتبر نیست.' })
  @Max(1500, { message: 'سال شمسی معتبر نیست.' })
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  equipmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  job?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  technicianId?: string;

  @IsOptional()
  @Matches(STATUS_KEY_PATTERN, { message: 'وضعیت انتخاب‌شده معتبر نیست.' })
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  operationType?: string;
}

export class ReportChartDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsIn(REPORT_DIMENSIONS, { message: 'فیلد گروه‌بندی معتبر نیست.' })
  dimension!: ReportDimension;

  @IsIn(REPORT_METRICS, { message: 'شاخص گزارش معتبر نیست.' })
  metric!: ReportMetric;

  @IsIn(REPORT_CHART_TYPES, { message: 'نوع نمودار معتبر نیست.' })
  chartType!: ReportChartType;
}

export class RunReportDto extends AnalyticsFilterDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'حداقل یک نمودار برای گزارش انتخاب کنید.' })
  @ArrayMaxSize(8, { message: 'حداکثر ۸ نمودار در یک گزارش قابل انتخاب است.' })
  @ValidateNested({ each: true })
  @Type(() => ReportChartDto)
  charts!: ReportChartDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(REPORT_TABLE_COLUMN_PATTERN, { each: true, message: 'ستون جدول معتبر نیست.' })
  tableColumns?: ReportTableColumn[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  tableLimit?: number;
}

export class CreateSavedReportDto {
  @IsString()
  @MinLength(2, { message: 'نام گزارش حداقل ۲ نویسه است.' })
  @MaxLength(120, { message: 'نام گزارش حداکثر ۱۲۰ نویسه است.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'توضیح گزارش حداکثر ۵۰۰ نویسه است.' })
  description?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsObject()
  @ValidateNested()
  @Type(() => RunReportDto)
  config!: RunReportDto;
}

export class UpdateSavedReportDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RunReportDto)
  config?: RunReportDto;

  @IsInt({ message: 'شماره نسخه قالب معتبر نیست.' })
  @Min(1)
  version!: number;
}
