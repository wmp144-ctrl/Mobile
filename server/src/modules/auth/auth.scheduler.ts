import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthScheduler {
  private readonly logger = new Logger(AuthScheduler.name);

  constructor(private readonly auth: AuthService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'purge-expired-sessions' })
  async purgeExpiredSessions(): Promise<void> {
    try {
      const removed = await this.auth.purgeExpiredSessions();
      this.logger.log(`پاک‌سازی نشست‌های قدیمی انجام شد (${removed} رکورد).`);
    } catch (error) {
      this.logger.error(`پاک‌سازی نشست‌های قدیمی ناموفق بود: ${(error as Error).message}`);
    }
  }
}
