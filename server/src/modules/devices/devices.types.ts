import {
  DEVICE_STATUSES,
  deviceStatusLabel,
  findDeviceStatus,
  operationResultLabel,
} from '../../common/device-status';

export interface DeviceRow {
  id: string;
  intake_code: string;
  customer_id: string;
  brought_by_name: string;
  brought_by_job: string | null;
  brought_by_phone: string | null;
  equipment_type: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  imei1: string | null;
  imei2: string | null;
  received_at: Date;
  due_at: Date | null;
  physical_condition: string | null;
  accessories: string[];
  lock_status: string;
  device_password_cipher: string | null;
  reported_problem: string;
  notes: string | null;
  technician_id: string | null;
  status: string;
  status_changed_at: Date;
  delivered_at: Date | null;
  custom_fields: Record<string, unknown>;
  version: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  owner_name: string;
  owner_phone: string | null;
  owner_job: string | null;
  technician_name: string | null;
  created_by_name: string | null;
  equipment_type_label: string | null;
  manufacturer_label: string | null;
  lock_status_label: string | null;
  operation_count: number;
}

export interface DeviceStatusHistoryRow {
  id: string;
  device_id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: Date;
}

export interface DeviceOperationRow {
  id: string;
  device_id: string;
  operation_type: string;
  title: string;
  performed_at: Date;
  technician_id: string | null;
  technician_name: string | null;
  description: string | null;
  data_size_bytes: string | null;
  storage_path: string | null;
  result: string;
  device_status_after: string | null;
  version: number;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
  operation_type_label: string | null;
}

export interface DeviceFileRow {
  id: string;
  device_id: string;
  label: string;
  path: string;
  storage_kind: string;
  related_operation_id: string | null;
  related_operation_title: string | null;
  notes: string | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceNoteRow {
  id: string;
  device_id: string;
  body: string;
  created_by_name: string | null;
  created_at: Date;
}

export interface DeviceImageRow {
  id: string;
  device_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  uploaded_by_name: string | null;
  created_at: Date;
  storage_path: string;
}

export interface DuplicateDeviceRow {
  id: string;
  intake_code: string;
  received_at: Date;
  status: string;
  model: string | null;
  imei1: string | null;
  imei2: string | null;
  serial_number: string | null;
  owner_name: string;
  customer_id: string;
}

export interface DeviceSummaryDto {
  id: string;
  intakeCode: string;
  status: { key: string; label: string; tone: string };
  equipmentType: { key: string; label: string };
  manufacturer: { key: string; label: string } | null;
  model: string | null;
  serialNumber: string | null;
  imei1: string | null;
  imei2: string | null;
  owner: { id: string; fullName: string; phone: string | null; jobTitle: string | null };
  broughtBy: { name: string; phone: string | null; job: string | null };
  technician: { id: string; fullName: string } | null;
  receivedAt: string;
  dueAt: string | null;
  deliveredAt: string | null;
  statusChangedAt: string;
  reportedProblem: string;
  hasPassword: boolean;
  operationCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
}

export interface DeviceStatusHistoryDto {
  id: string;
  fromStatus: { key: string; label: string } | null;
  toStatus: { key: string; label: string };
  note: string | null;
  changedByName: string | null;
  changedAt: string;
}

export interface DeviceOperationDto {
  id: string;
  operationType: { key: string; label: string };
  title: string;
  performedAt: string;
  technicianId: string | null;
  technicianName: string | null;
  description: string | null;
  dataSizeBytes: number | null;
  storagePath: string | null;
  result: { key: string; label: string };
  deviceStatusAfter: { key: string; label: string } | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DeviceFileDto {
  id: string;
  label: string;
  path: string;
  storageKind: string;
  relatedOperationId: string | null;
  relatedOperationTitle: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceNoteDto {
  id: string;
  body: string;
  createdByName: string | null;
  createdAt: string;
}

export interface DeviceImageDto {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  uploadedByName: string | null;
  createdAt: string;
  url: string;
}

export interface DuplicateDeviceDto {
  id: string;
  intakeCode: string;
  receivedAt: string;
  status: { key: string; label: string };
  model: string | null;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  ownerName: string;
}

export interface DeviceDetailDto extends DeviceSummaryDto {
  physicalCondition: string | null;
  accessories: string[];
  lockStatus: { key: string; label: string };
  notes: string | null;
  customFields: Record<string, unknown>;
  statusHistory: DeviceStatusHistoryDto[];
  operations: DeviceOperationDto[];
  files: DeviceFileDto[];
  technicianNotes: DeviceNoteDto[];
  images: DeviceImageDto[];
}

export const DEVICE_SELECT = `
  d.id, d.intake_code, d.customer_id, d.brought_by_name, d.brought_by_job, d.brought_by_phone,
  d.equipment_type, d.manufacturer, d.model, d.serial_number, d.imei1, d.imei2,
  d.received_at, d.due_at, d.physical_condition, d.accessories, d.lock_status,
  d.device_password_cipher, d.reported_problem, d.notes, d.technician_id, d.status,
  d.status_changed_at, d.delivered_at, d.custom_fields, d.version, d.created_by,
  d.created_at, d.updated_at,
  c.full_name AS owner_name, c.phone AS owner_phone, c.job_title AS owner_job,
  t.full_name AS technician_name, cu.full_name AS created_by_name,
  et.label_fa AS equipment_type_label, mf.label_fa AS manufacturer_label,
  ls.label_fa AS lock_status_label,
  (SELECT COUNT(*)::int FROM device_operations o
    WHERE o.device_id = d.id AND o.deleted_at IS NULL) AS operation_count
`;

export const DEVICE_FROM = `
  FROM devices d
  JOIN customers c ON c.id = d.customer_id
  LEFT JOIN users t ON t.id = d.technician_id
  LEFT JOIN users cu ON cu.id = d.created_by
  LEFT JOIN option_lists et ON et.category = 'equipment_type' AND et.value_key = d.equipment_type
  LEFT JOIN option_lists mf ON mf.category = 'manufacturer' AND mf.value_key = d.manufacturer
  LEFT JOIN option_lists ls ON ls.category = 'lock_status' AND ls.value_key = d.lock_status
`;

const UNKNOWN_STATUS_TONE = 'neutral';

export function toDeviceSummary(row: DeviceRow): DeviceSummaryDto {
  const status = findDeviceStatus(row.status);
  return {
    id: row.id,
    intakeCode: row.intake_code,
    status: {
      key: row.status,
      label: deviceStatusLabel(row.status),
      tone: status?.tone ?? UNKNOWN_STATUS_TONE,
    },
    equipmentType: {
      key: row.equipment_type,
      label: row.equipment_type_label ?? row.equipment_type,
    },
    manufacturer: row.manufacturer
      ? { key: row.manufacturer, label: row.manufacturer_label ?? row.manufacturer }
      : null,
    model: row.model,
    serialNumber: row.serial_number,
    imei1: row.imei1,
    imei2: row.imei2,
    owner: {
      id: row.customer_id,
      fullName: row.owner_name,
      phone: row.owner_phone,
      jobTitle: row.owner_job,
    },
    broughtBy: { name: row.brought_by_name, phone: row.brought_by_phone, job: row.brought_by_job },
    technician:
      row.technician_id && row.technician_name
        ? { id: row.technician_id, fullName: row.technician_name }
        : null,
    receivedAt: row.received_at.toISOString(),
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : null,
    statusChangedAt: row.status_changed_at.toISOString(),
    reportedProblem: row.reported_problem,
    hasPassword: Boolean(row.device_password_cipher),
    operationCount: row.operation_count,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdByName: row.created_by_name,
  };
}

export function toStatusHistory(row: DeviceStatusHistoryRow): DeviceStatusHistoryDto {
  return {
    id: String(row.id),
    fromStatus: row.from_status
      ? { key: row.from_status, label: deviceStatusLabel(row.from_status) }
      : null,
    toStatus: { key: row.to_status, label: deviceStatusLabel(row.to_status) },
    note: row.note,
    changedByName: row.changed_by_name,
    changedAt: row.changed_at.toISOString(),
  };
}

export function toOperation(row: DeviceOperationRow): DeviceOperationDto {
  return {
    id: row.id,
    operationType: {
      key: row.operation_type,
      label: row.operation_type_label ?? row.operation_type,
    },
    title: row.title,
    performedAt: row.performed_at.toISOString(),
    technicianId: row.technician_id,
    technicianName: row.technician_name,
    description: row.description,
    dataSizeBytes: row.data_size_bytes === null ? null : Number(row.data_size_bytes),
    storagePath: row.storage_path,
    result: { key: row.result, label: operationResultLabel(row.result) },
    deviceStatusAfter: row.device_status_after
      ? { key: row.device_status_after, label: deviceStatusLabel(row.device_status_after) }
      : null,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: row.version,
  };
}

export function toFile(row: DeviceFileRow): DeviceFileDto {
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    storageKind: row.storage_kind,
    relatedOperationId: row.related_operation_id,
    relatedOperationTitle: row.related_operation_title,
    notes: row.notes,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toNote(row: DeviceNoteRow): DeviceNoteDto {
  return {
    id: row.id,
    body: row.body,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
  };
}

export function toImage(row: DeviceImageRow): DeviceImageDto {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    caption: row.caption,
    uploadedByName: row.uploaded_by_name,
    createdAt: row.created_at.toISOString(),
    url: `/api/devices/${row.device_id}/images/${row.id}/file`,
  };
}

export function toDuplicate(row: DuplicateDeviceRow): DuplicateDeviceDto {
  return {
    id: row.id,
    intakeCode: row.intake_code,
    receivedAt: row.received_at.toISOString(),
    status: { key: row.status, label: deviceStatusLabel(row.status) },
    model: row.model,
    imei1: row.imei1,
    imei2: row.imei2,
    serialNumber: row.serial_number,
    ownerName: row.owner_name,
  };
}

export const ALL_STATUS_OPTIONS = DEVICE_STATUSES.map((status) => ({
  key: status.key,
  label: status.label,
  tone: status.tone,
}));
