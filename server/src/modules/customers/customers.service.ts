import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/errors/app.exception';
import type { PageResult } from '../../common/utils/pagination';
import { AuditService, type AuditActor } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './customers.dto';
import { CustomersRepository, type UpdateCustomerInput } from './customers.repository';
import type { PublicCustomer } from './customers.types';

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly repo: CustomersRepository,
    private readonly audit: AuditService,
  ) {}

  list(query: ListCustomersQueryDto): Promise<PageResult<PublicCustomer>> {
    return this.repo.list({ search: query.search, page: query.page, pageSize: query.pageSize });
  }

  options(search?: string): Promise<PublicCustomer[]> {
    return this.repo.searchOptions(search);
  }

  async getById(id: string): Promise<PublicCustomer> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'مشتری مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    return {
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      phoneSecondary: row.phone_secondary,
      jobTitle: row.job_title,
      nationalId: row.national_id,
      address: row.address,
      notes: row.notes,
      version: row.version,
      deviceCount: row.device_count,
      createdByName: row.created_by_name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async create(dto: CreateCustomerDto, actor: AuditActor): Promise<PublicCustomer> {
    const created = await this.repo.insert(
      {
        fullName: dto.fullName.trim(),
        phone: clean(dto.phone),
        phoneSecondary: clean(dto.phoneSecondary),
        jobTitle: clean(dto.jobTitle),
        nationalId: clean(dto.nationalId),
        address: clean(dto.address),
        notes: clean(dto.notes),
      },
      actor.id,
    );

    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.CUSTOMER_CREATED,
      entityType: 'customer',
      entityId: created.id,
      description: `مشتری «${created.fullName}» ثبت شد.`,
      metadata: { phone: created.phone },
    });
    return created;
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuditActor): Promise<PublicCustomer> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'مشتری مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }

    // فقط فیلدهای ارسال‌شده تغییر می‌کنند تا ویرایش جزئی، اطلاعات دیگر را پاک نکند
    const changes: UpdateCustomerInput = { fullName: dto.fullName.trim() };
    if (dto.phone !== undefined) changes.phone = clean(dto.phone);
    if (dto.phoneSecondary !== undefined) changes.phoneSecondary = clean(dto.phoneSecondary);
    if (dto.jobTitle !== undefined) changes.jobTitle = clean(dto.jobTitle);
    if (dto.nationalId !== undefined) changes.nationalId = clean(dto.nationalId);
    if (dto.address !== undefined) changes.address = clean(dto.address);
    if (dto.notes !== undefined) changes.notes = clean(dto.notes);

    const updated = await this.repo.update(id, dto.version, changes);
    if (!updated) {
      const stillThere = await this.repo.findById(id);
      if (!stillThere) {
        throw new AppException(ErrorCodes.NOT_FOUND, 'مشتری مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
      }
      throw new AppException(
        ErrorCodes.CONFLICT,
        'اطلاعات این مشتری توسط کاربر دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.',
        HttpStatus.CONFLICT,
        { currentVersion: stillThere.version },
      );
    }

    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
      entityType: 'customer',
      entityId: id,
      description: `اطلاعات مشتری «${updated.full_name}» ویرایش شد.`,
    });

    return this.getById(id);
  }

  async remove(id: string, actor: AuditActor): Promise<{ success: true }> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException(ErrorCodes.NOT_FOUND, 'مشتری مورد نظر پیدا نشد.', HttpStatus.NOT_FOUND);
    }
    const devices = await this.repo.countDevices(id);
    if (devices > 0) {
      throw new AppException(
        ErrorCodes.CUSTOMER_HAS_DEVICES,
        `این مشتری ${devices} پرونده دستگاه دارد و حذف او ممکن نیست. ابتدا پرونده‌های دستگاه را تعیین تکلیف کنید.`,
        HttpStatus.CONFLICT,
        { deviceCount: devices },
      );
    }

    await this.repo.softDelete(id);
    await this.audit.log({
      actor,
      action: AUDIT_ACTIONS.CUSTOMER_DELETED,
      entityType: 'customer',
      entityId: id,
      description: `مشتری «${existing.full_name}» حذف شد.`,
    });
    return { success: true };
  }
}
