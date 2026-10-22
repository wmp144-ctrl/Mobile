import { useCallback } from 'react';
import { useAuth } from '@/stores/auth';

export function usePermissions(): {
  can: (permission: string) => boolean;
  permissions: string[];
} {
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const can = useCallback(
    (permission: string) =>
      permissions.includes('*') || permissions.includes(permission),
    [permissions],
  );
  return { can, permissions };
}
