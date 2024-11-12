// bot.js
const mineflayer = require('mineflayer');
const { readFile } = require('fs').promises;
const { join } = require('path');

// Suppress deprecation warnings
process.noDeprecation = true;

class MinecraftBot {
    constructor(username, config) {
        this.username = username;
        this.config = config;
        this.active = false;
        this.inLobby = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async connect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`[${this.username}] Máximo de intentos de reconexión alcanzado`);
            return;
        }

        try {
            this.bot = mineflayer.createBot({
                host: 'anarchy.6b6t.org',
                username: this.username,
                version: '1.18.2',
                auth: 'offline',
                chatLengthLimit: 256,
                closeTimeout: 60 * 1000, // 60 segundos timeout
                checkTimeoutInterval: 30 * 1000 // 30 segundos check interval
            });

            this.setupEventHandlers();
            this.reconnectAttempts++;
        } catch (error) {
            console.error(`[${this.username}] Error al conectar:`, error);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        this.bot.once('spawn', () => this.onSpawn());
        this.bot.once('login', () => this.onLogin());
        this.bot.on('message', (message) => this.onMessage(message));
        this.bot.on('error', (error) => this.onError(error));
        this.bot.on('kicked', (reason) => this.onKicked(reason));
        this.bot.on('end', () => this.onEnd());
        
        // Manejo de errores no capturados
        this.bot.on('error', console.error);
        process.on('uncaughtException', (error) => {
            console.error('Error no capturado:', error);
            this.disconnect();
            this.scheduleReconnect();
        });
    }

    async onSpawn() {
        this.active = true;
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful spawn
        console.log(`[${this.username}] Bot conectado`);
        await this.startBotLoop();
    }

    async onLogin() {
        try {
            await this.sleep(2000);
            this.bot.chat(`/register ${this.config.password} ${this.config.password}`);
            await this.sleep(2000);
            this.bot.chat(`/login ${this.config.password}`);
            console.log(`[${this.username}] Autenticado`);
        } catch (error) {
            console.error(`[${this.username}] Error en login:`, error);
        }
    }

    async startBotLoop() {
        while (this.active) {
            try {
                if (!this.isInLobby()) {
                    await this.sendMessages();
                } else {
                    await this.tryLeaveLobby();
                }
                await this.sleep(1000);
            } catch (error) {
                console.error(`[${this.username}] Error en el loop:`, error);
                break;
            }
        }
    }

    isInLobby() {
        return !this.bot?.game?.difficulty || this.bot.game.difficulty !== 'hard';
    }

    async tryLeaveLobby() {
        if (!this.inLobby) {
            this.inLobby = true;
            console.log(`[${this.username}] Intentando salir del lobby...`);
            
            const movements = [
                { action: 'forward', duration: 2000 },
                { action: 'back', duration: 1000 },
                { action: 'forward', duration: 1500 }
            ];

            for (const move of movements) {
                if (!this.active) break;
                this.bot.setControlState(move.action, true);
                await this.sleep(move.duration);
                this.bot.setControlState(move.action, false);
                await this.sleep(500);
            }

            this.inLobby = false;
        }
    }

    async sendMessages() {
        if (!this.bot?.players) return;

        for (const [username, player] of Object.entries(this.bot.players)) {
            if (!this.active) break;
            if (this.shouldSkipPlayer(username)) continue;

            try {
                const message = this.getRandomMessage();
                this.bot.chat(`/msg ${username} ${message}`);
                await this.sleep(1000); // Espera entre mensajes
            } catch (error) {
                console.error(`[${this.username}] Error enviando mensaje a ${username}:`, error);
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
    }

    onError(error) {
        console.error(`[${this.username}] Error:`, error);
        this.disconnect();
        this.scheduleReconnect();
    }

    onKicked(reason) {
        console.log(`[${this.username}] Kicked:`, reason);
        this.disconnect();
        this.scheduleReconnect();
    }

    onEnd() {
        console.log(`[${this.username}] Desconectado`);
        this.disconnect();
        this.scheduleReconnect();
    }

    disconnect() {
        this.active = false;
        this.inLobby = false;
        if (this.bot) {
            this.bot.removeAllListeners();
            this.bot.end();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            setTimeout(() => this.connect(), delay);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class BotManager {
    constructor() {
        this.bots = new Map();
    }

    async loadConfig() {
        try {
            const configPath = join(__dirname, 'config.json');
            const configData = await readFile(configPath, 'utf8');
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
            
            // Generar un tiempo de espera aleatorio entre 5 y 30 segundos
            const randomDelay = Math.floor(Math.random() * (30000 - 5000 + 1)) + 5000;
            
            console.log(`[${username}] Conectando en ${randomDelay/1000} segundos...`);
            
            // Programar la conexión con un retraso aleatorio
            setTimeout(async () => {
                await bot.connect();
            }, randomDelay);
            
            // Pequeña pausa adicional para evitar sobrecargar el servidor
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.error('Error iniciando bots:', error);
    }
}
    stop() {
        for (const bot of this.bots.values()) {
            bot.disconnect();
        }
        this.bots.clear();
    }
}

// Manejo de señales de terminación
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
    console.log('\nCerrando bots...');
    manager.stop();
    process.exit(0);
}

// Iniciar los bots
const manager = new BotManager();
manager.start().catch(console.error);
