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

    // Launch bot
    await bot.launch();

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
