# BirrForex Weekly Challenge Bot

Automated Telegram bot for hosting weekly quiz challenges with prizes.

## Features

- 🎯 Automated weekly challenges (Wednesday & Sunday)
- 📝 Multiple choice questions (3-10 per challenge)
- 🏆 Perfect score requirement for winning
- ⚡ Speed-based ranking
- 🚫 Consecutive win prevention
- 📊 Detailed statistics and leaderboards
- 👨‍💼 Easy admin management

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your values
3. Install dependencies: `npm install`
4. Run database migrations: `npm run migrate`
5. Start the bot: `npm run dev`

## Deployment

Deploy to Railway:
1. Connect your GitHub repository
2. Add environment variables
3. Deploy!

## Admin Commands

- `/createchallenge` - Create a new challenge
- `/passwinner` - Transfer prize to next winner
- `/cancelchallenge` - Cancel a scheduled challenge
- `/settings` - Configure bot settings

## User Commands

- `/start` - Start the bot
- `/mystats` - View personal statistics
- `/winners` - View previous winners
- `/questions` - View previous questions
- `/next` - View next challenge info
- `/rules` - View challenge rules

## Documentation

See `BirrForex_Challenges_Bot_COMPLETE_USERFLOW.md` for complete user flow and framework.

## License

MIT
