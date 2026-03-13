import { Bot } from '../bot/bot';
import { userService } from './userService';
import { challengeService } from './challengeService';
import { Markup } from 'telegraf';

export class NotificationService {
  /**
   * Send challenge notifications to all users with notifications enabled
   */
  async sendChallengeNotifications(bot: Bot): Promise<void> {
    try {
      const today = new Date();
      const challenge = await challengeService.getChallengeByDate(today);

      if (!challenge) {
        console.log('No challenge configured for today, skipping notifications');
        return;
      }

      const users = await userService.getUsersWithNotifications();
      
      if (users.length === 0) {
        console.log('No users with notifications enabled');
        return;
      }

      const day = challenge.day;
      const text = `🔔 <b>BirrForex Weekly Challenge - ${day} Round Today</b>

The challenge goes live at 8:00 PM EAT!

Visit the main channel for details.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('📢 Visit Main Channel', 'https://t.me/BirrForex')],
        [Markup.button.callback('🔕 Disable Notifications', 'disable_notifications')]
      ]);

      let successCount = 0;
      let failCount = 0;

      for (const user of users) {
        try {
          await bot.bot.telegram.sendMessage(
            user.telegram_id,
            text,
            { 
              parse_mode: 'HTML',
              link_preview_options: { is_disabled: true },
              ...keyboard
            }
          );
          successCount++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error(`Failed to send notification to user ${user.telegram_id}:`, error);
          failCount++;
        }
      }

      console.log(`✅ Notifications sent: ${successCount} successful, ${failCount} failed`);
    } catch (error) {
      console.error('Error sending challenge notifications:', error);
    }
  }
}

export const notificationService = new NotificationService();
