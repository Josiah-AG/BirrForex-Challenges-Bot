import { Bot } from './bot/bot';
import { Scheduler } from './scheduler/scheduler';
import { db } from './database/db';

async function main() {
  try {
    console.log('🚀 Starting BirrForex Challenges Bot...');

    // Test database connection
    await db.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Initialize bot
    const bot = new Bot();

    // Initialize scheduler
    const scheduler = new Scheduler(bot);
    scheduler.start();

    // Pass scheduler to bot for testing
    bot.setScheduler(scheduler);

    // Launch bot with retry logic for 409 conflicts
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        await bot.launch();
        break; // Success, exit retry loop
      } catch (error: any) {
        if (error?.response?.error_code === 409 && retries < maxRetries - 1) {
          retries++;
          const waitTime = retries * 5000; // 5s, 10s, 15s
          console.log(`⚠️  Bot conflict detected (409). Waiting ${waitTime/1000}s before retry ${retries}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          throw error; // Re-throw if not 409 or max retries reached
        }
      }
    }

    console.log('✅ Bot launched successfully');

    // Graceful shutdown
    process.once('SIGINT', () => {
      console.log('\n⏹️  Stopping bot...');
      bot.stop();
      db.close();
      process.exit(0);
    });

    process.once('SIGTERM', () => {
      console.log('\n⏹️  Stopping bot...');
      bot.stop();
      db.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main();
