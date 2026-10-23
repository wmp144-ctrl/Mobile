export interface FieldDefinitionRow {
  id: string;
  entity: string;
  field_key: string;
  label_fa: string;
  field_type: string;
  group_name: string;
  placeholder: string | null;
  is_system: boolean;
  is_enabled: boolean;
  is_required: boolean;
  is_locked: boolean;
  options: { value: string; label: string }[];
  sort_order: number;
  is_searchable: boolean;
  is_reportable: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FieldDefinitionDto {
  id: string;
  key: string;
  label: string;
  type: string;
  group: string;
  placeholder: string | null;
  isSystem: boolean;
  isEnabled: boolean;
  isRequired: boolean;
  isLocked: boolean;
  options: { value: string; label: string }[];
  sortOrder: number;
  isSearchable: boolean;
  isReportable: boolean;
}

export interface OptionRow {
  id: string;
  category: string;
  value_key: string;
  label_fa: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  usage_count: number;
}

export interface OptionDto {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  usageCount: number;
}

export const FIELD_OPTION_SELECT = `
  f.id, f.entity, f.field_key, f.label_fa, f.field_type, f.group_name, f.placeholder,
  f.is_system, f.is_enabled, f.is_required, f.is_locked, f.options, f.sort_order,
  f.is_searchable, f.is_reportable, f.created_at, f.updated_at
`;

export function toField(row: FieldDefinitionRow): FieldDefinitionDto {
  return {
    id: row.id,
    key: row.field_key,
    label: row.label_fa,
    type: row.field_type,
    group: row.group_name,
    placeholder: row.placeholder,
    isSystem: row.is_system,
    isEnabled: row.is_enabled,
    isRequired: row.is_required,
    isLocked: row.is_locked,
    options: Array.isArray(row.options) ? row.options : [],
    sortOrder: row.sort_order,
    isSearchable: row.is_searchable,
    isReportable: row.is_reportable,
  };
}

export function toOption(row: OptionRow): OptionDto {
  return {
    id: row.id,
    key: row.value_key,
    label: row.label_fa,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    isSystem: row.is_system,
    usageCount: row.usage_count,
  };
}
