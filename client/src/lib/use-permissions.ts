import { useCallback } from 'react';
import { useAuth } from '@/stores/auth';

const EMPTY_PERMISSIONS: string[] = [];

export function usePermissions(): {
  can: (permission: string) => boolean;
  permissions: string[];
} {
  const user = useAuth((state) => state.user);
  const permissions = user?.permissions ?? EMPTY_PERMISSIONS;
  const can = useCallback(
    (permission: string) =>
      permissions.includes('*') || permissions.includes(permission),
    [permissions],
  );
  return { can, permissions };
}
