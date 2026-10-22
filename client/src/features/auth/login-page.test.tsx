import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/toast';
import { useAuth } from '@/stores/auth';
import { LoginPage } from './login-page';

describe('صفحه ورود', () => {
  beforeEach(() => {
    useAuth.setState({
      status: 'anon',
      user: null,
      workshopName: 'تعمیرگاه نمونه',
      appVersion: '1.0.0',
      bootstrapError: null,
    });
  });

  it('نام کاربری و رمز عبور را به سرور می‌فرستد', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    useAuth.setState({ login });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToastProvider>
          <LoginPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('نام کاربری'), 'admin');
    await user.type(screen.getByLabelText('رمز عبور'), 'Passw0rd123');
    await user.click(screen.getByRole('button', { name: /ورود به سامانه/ }));

    expect(login).toHaveBeenCalledWith('admin', 'Passw0rd123');
  });

  it('پیام خطای سرور را نمایش می‌دهد', async () => {
    const login = vi.fn().mockRejectedValue(new Error('نام کاربری یا رمز عبور اشتباه است.'));
    useAuth.setState({ login });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToastProvider>
          <LoginPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('نام کاربری'), 'admin');
    await user.type(screen.getByLabelText('رمز عبور'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /ورود به سامانه/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('نام کاربری یا رمز عبور اشتباه است.');
  });
});
