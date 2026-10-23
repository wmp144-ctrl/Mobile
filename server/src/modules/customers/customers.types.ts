export interface CustomerRow {
  id: string;
  full_name: string;
  phone: string | null;
  phone_secondary: string | null;
  job_title: string | null;
  national_id: string | null;
  address: string | null;
  notes: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  device_count: number;
  created_by_name: string | null;
}

export interface PublicCustomer {
  id: string;
  fullName: string;
  phone: string | null;
  phoneSecondary: string | null;
  jobTitle: string | null;
  nationalId: string | null;
  address: string | null;
  notes: string | null;
  version: number;
  deviceCount: number;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDeviceRow {
  id: string;
  intake_code: string;
  status: string;
  status_label: string | null;
  equipment_type: string;
  equipment_type_label: string | null;
  model: string | null;
  reported_problem: string;
  received_at: Date;
  delivered_at: Date | null;
}

export interface CustomerDeviceDto {
  id: string;
  intakeCode: string;
  status: { key: string; label: string };
  equipmentType: string;
  model: string | null;
  reportedProblem: string;
  receivedAt: string;
  deliveredAt: string | null;
}

export function toCustomerDevice(row: CustomerDeviceRow): CustomerDeviceDto {
  return {
    id: row.id,
    intakeCode: row.intake_code,
    status: {
      key: row.status,
      label: row.status_label ?? row.status,
    },
    equipmentType: row.equipment_type_label ?? row.equipment_type,
    model: row.model,
    reportedProblem: row.reported_problem,
    receivedAt: row.received_at.toISOString(),
    deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : null,
  };
}

export const CUSTOMER_SELECT = `
  c.id, c.full_name, c.phone, c.phone_secondary, c.job_title, c.national_id, c.address,
  c.notes, c.version, c.created_at, c.updated_at,
  (SELECT COUNT(*)::int FROM devices d WHERE d.customer_id = c.id) AS device_count,
  u.full_name AS created_by_name
`;

export const CUSTOMER_FROM = `
  FROM customers c
  LEFT JOIN users u ON u.id = c.created_by
`;

export function toPublicCustomer(row: CustomerRow): PublicCustomer {
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
