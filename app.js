const fs = require('fs').promises;  // Using promises version for better async handling
const mineflayer = require('mineflayer');
const path = require('path');

let lobbyF = false;

// Load config asynchronously
async function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Error loading config:', error);
    process.exit(1);
  }
}

function getRandomMessage(messages) {
  return ' ' + messages[Math.floor(Math.random() * messages.length)];
}

function isInLobby(bot) {
  if (!bot?.game?.difficulty === 'hard') {
    if (!lobbyF) leaveLobby(bot);
    return true;
  }
  return false;
}

async function leaveLobby(bot) {
  if (!bot) return;
  
  lobbyF = true;
  try {
    // Move forward
    bot.controlState.forward = true;
    await bot.waitForTicks(40);
    bot.controlState.forward = false;

    // Keep trying to leave lobby until difficulty is hard
    while (bot?.game?.difficulty !== 'hard') {
      // Move back and forth
      bot.controlState.back = true;
      await bot.waitForTicks(20);
      bot.controlState.back = false;

      bot.controlState.forward = true;
      await bot.waitForTicks(30);
      bot.controlState.forward = false;
    }
  } catch (error) {
    console.error('Error in leaveLobby:', error);
  } finally {
    lobbyF = false;
  }
}

class MinecraftBot {
  constructor(username, config) {
    this.username = username;
    this.config = config;
    this.forceStop = false;
    this.bot = null;
  }

  async initialize() {
    this.bot = mineflayer.createBot({
      host: 'anarchy.6b6t.org',
      username: this.username,
      version: '1.18.1',
      skipValidation: true,
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.bot.once('spawn', () => this.handleSpawn());
    this.bot.once('login', () => this.handleLogin());
    this.bot.on('error', this.handleError.bind(this));
    this.bot.on('messagestr', this.handleMessage.bind(this));
    this.bot.on('message', (message) => console.log(message.toAnsi()));
    this.bot.on('kicked', this.handleKick.bind(this));
    this.bot.on('end', () => this.handleEnd());
  }

  async handleSpawn() {
    let lobbyCount = 0;
    while (!this.forceStop) {
      try {
        await this.bot.waitForTicks(20);
        if (lobbyCount > 30) {
          this.bot.end();
          break;
        }
        if (!this.bot?.entity?.position) continue;
        if (isInLobby(this.bot)) lobbyCount++;
      } catch (error) {
        console.error('Error in spawn handler:', error);
      }
    }
  }

  async handleLogin() {
    try {
      await this.bot.waitForTicks(100);
      this.bot.chat('/register ' + this.config.password);
      await this.bot.waitForTicks(100);
      this.bot.chat('/login ' + this.config.password);

      while (!this.forceStop) {
        if (!isInLobby(this.bot)) {
          for (const player in this.bot.players) {
            const targetUsername = this.bot.players[player].username;
            if (this.config.blacklist.includes(targetUsername.toLowerCase()) || 
                this.bot.entity.username === targetUsername) continue;
            
            if (this.forceStop) return;
            
            this.bot.chat('/msg ' + targetUsername + getRandomMessage(this.config.messages));
            await this.bot.waitForTicks(20);
          }
        }
        await this.bot.waitForTicks(2);
      }
    } catch (error) {
      console.error('Error in login handler:', error);
    }
  }

  handleError(err) {
    console.error('Bot error:', err);
    this.bot.end();
  }

  handleMessage(message, pos) {
    if (pos === 'chat' && message.startsWith('You whisper to ')) {
      console.log(message);
    }
  }

  handleKick(reason) {
    console.log('Bot kicked:', reason);
    this.bot.end();
  }

  handleEnd() {
    this.bot.removeAllListeners();
    this.forceStop = true;
    setTimeout(() => {
      this.forceStop = false;
      this.initialize();
    }, 5000);
  }
}

async function main() {
  try {
    const config = await loadConfig();
    
    // Create and initialize a bot for each user
    const bots = config.users.map(username => new MinecraftBot(username, config));
    await Promise.all(bots.map(bot => bot.initialize()));
  } catch (error) {
    console.error('Error in main:', error);
  }
}

// Start the application
main().catch(console.error);
