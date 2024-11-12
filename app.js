const mineflayer = require('mineflayer');
const fs = require('fs').promises;
const path = require('path');

class MinecraftBot {
    constructor(username, config) {
        this.username = username;
        this.config = config;
        this.active = false;
        this.inLobby = false;
        this.messageDelay = 20; // Ticks entre mensajes
        this.reconnectDelay = 5000; // 5 segundos para reconexión
    }

    async connect() {
        this.bot = mineflayer.createBot({
            host: 'anarchy.6b6t.org',
            username: this.username,
            version: '1.18.2',
            auth: 'offline',
            skipValidation: true
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.bot.once('spawn', () => this.onSpawn());
        this.bot.once('login', () => this.onLogin());
        this.bot.on('message', (message) => this.onMessage(message));
        this.bot.on('error', (error) => this.onError(error));
        this.bot.on('kicked', (reason) => this.onKicked(reason));
        this.bot.on('end', () => this.onEnd());
    }

    async onSpawn() {
        this.active = true;
        console.log(`[${this.username}] Bot spawned`);
        this.checkLobbyLoop();
    }

    async onLogin() {
        try {
            await this.bot.waitForTicks(50);
            this.bot.chat(`/register ${this.config.password} ${this.config.password}`);
            await this.bot.waitForTicks(50);
            this.bot.chat(`/login ${this.config.password}`);
            console.log(`[${this.username}] Logged in`);
            this.startMessaging();
        } catch (error) {
            console.error(`[${this.username}] Error en login:`, error);
        }
    }

    async checkLobbyLoop() {
        while (this.active) {
            try {
                await this.bot.waitForTicks(20);
                if (this.isInLobby()) {
                    if (!this.inLobby) {
                        console.log(`[${this.username}] En lobby, intentando salir...`);
                        await this.leaveLobby();
                    }
                } else {
                    this.inLobby = false;
                }
            } catch (error) {
                console.error(`[${this.username}] Error en lobby check:`, error);
            }
        }
    }

    isInLobby() {
        return !this.bot?.game?.difficulty || this.bot.game.difficulty !== 'hard';
    }

    async leaveLobby() {
        this.inLobby = true;
        try {
            // Secuencia de movimientos para salir del lobby
            const movements = [
                { direction: 'forward', ticks: 40 },
                { direction: 'back', ticks: 20 },
                { direction: 'forward', ticks: 30 }
            ];

            for (const move of movements) {
                if (!this.active) break;
                this.bot.controlState[move.direction] = true;
                await this.bot.waitForTicks(move.ticks);
                this.bot.controlState[move.direction] = false;
                await this.bot.waitForTicks(5);
            }
        } catch (error) {
            console.error(`[${this.username}] Error al salir del lobby:`, error);
        }
    }

    async startMessaging() {
        while (this.active) {
            try {
                if (!this.isInLobby()) {
                    await this.sendMessagesToPlayers();
                }
                await this.bot.waitForTicks(this.messageDelay);
            } catch (error) {
                console.error(`[${this.username}] Error en messaging:`, error);
                break;
            }
        }
    }

    async sendMessagesToPlayers() {
        const players = Object.values(this.bot.players);
        for (const player of players) {
            if (!this.active) break;
            
            const targetUsername = player.username;
            if (this.shouldSkipPlayer(targetUsername)) continue;

            const message = this.getRandomMessage();
            try {
                this.bot.chat(`/msg ${targetUsername} ${message}`);
                await this.bot.waitForTicks(10);
            } catch (error) {
                console.error(`[${this.username}] Error enviando mensaje a ${targetUsername}:`, error);
            }
        }
    }

    shouldSkipPlayer(username) {
        return this.config.blacklist.includes(username.toLowerCase()) ||
               username === this.username;
    }

    getRandomMessage() {
        const messages = this.config.messages;
        return messages[Math.floor(Math.random() * messages.length)];
    }

    onMessage(message) {
        const text = message.toString().trim();
        if (text.startsWith('You whisper to ')) {
            console.log(`[${this.username}] ${text}`);
        }
        console.log(`[${this.username}] ${message.toAnsi()}`);
    }

    onError(error) {
        console.error(`[${this.username}] Error:`, error);
        this.disconnect();
    }

    onKicked(reason) {
        console.log(`[${this.username}] Kicked:`, reason);
        this.disconnect();
    }

    onEnd() {
        console.log(`[${this.username}] Disconnected`);
        this.disconnect();
        setTimeout(() => {
            if (this.shouldReconnect) {
                console.log(`[${this.username}] Intentando reconectar...`);
                this.connect();
            }
        }, this.reconnectDelay);
    }

    disconnect() {
        this.active = false;
        this.inLobby = false;
        if (this.bot) {
            this.bot.removeAllListeners();
            this.bot.end();
        }
    }
}

class BotManager {
    constructor() {
        this.bots = new Map();
        this.shouldReconnect = true;
    }

    async loadConfig() {
        try {
            const configPath = path.join(__dirname, 'config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.error('Error cargando config:', error);
            throw error;
        }
    }

    async start() {
        try {
            const config = await this.loadConfig();
            
            for (const username of config.users) {
                const bot = new MinecraftBot(username, config);
                this.bots.set(username, bot);
                await bot.connect();
                await new Promise(resolve => setTimeout(resolve, 5000)); // Espera entre conexiones
            }
        } catch (error) {
            console.error('Error iniciando bots:', error);
        }
    }

    stop() {
        this.shouldReconnect = false;
        for (const bot of this.bots.values()) {
            bot.disconnect();
        }
        this.bots.clear();
    }
}

// Iniciar los bots
const manager = new BotManager();
manager.start().catch(console.error);

// Manejar cierre del programa
process.on('SIGINT', () => {
    console.log('Cerrando bots...');
    manager.stop();
    process.exit();
});
