const { Client, GatewayIntentBits } = require('discord.js');

// Accept multiple possible environment variable names to avoid typos in the dashboard
const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOK || process.env.TOKEN;

if (!token) {
  console.error('Missing Discord token environment variable. Please set DISCORD_TOKEN in your Discloud env.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Basic health logging for uncaught errors so you can see them in Discloud logs
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

client.login(token).catch(err => {
  console.error('Failed to login:', err);
});
