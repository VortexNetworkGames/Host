const { Client, ChannelType, PermissionsBitField, GatewayIntentBits, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const { exec, spawn } = require('child_process');
const Discord = require('discord.js');
const fs = require('fs');
const config = require('./src/config/config.json');
const emoji = require('./src/config/emojis.json');
const archiver = require('archiver');
const https = require('https');
const extract = require('extract-zip'); //
const axios = require('axios');
const webhookUrl = 'https://discord.com/api/webhooks/1238940539148304505/lG4s0Hafs7v92opVgGk0a_RXeT3aCn7sXD1RbyzLXp56XdytnDSTyx5oFudG6fmzCXFx';
const path = require('path');
const pidusage = require('pidusage');
const semver = require('semver');
const AdmZip = require('adm-zip'); // Importa a biblioteca para manipulação de arquivos ZIP
const client = new Discord.Client({ intents: [1, 512, 32768, 2, 128] });
const userBots = {}; // Map para rastrear bots (userId -> processo)

//
let isHostActive = true; // Variável para controlar o status do host (verdadeiro significa online)
let isUploads = false;
let isPanelActive = true; // Variável para controlar o status do painel
//

const mongoose = require("mongoose");

const mongoURI = config.mongodb;
const db = mongoose.connection;
db.on("error", console.error.bind(console, "Erro ao conectar ao MongoDB:"));
db.once("open", () => {
  console.log("👤 | ( Vincular ) Conectado ao MongoDB!");
});

// Modelo para armazenar os dados do usuário
const UserSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  registrationDate: Date,
  apiToken: String,
});
const UserModel = mongoose.model("User", UserSchema);

// Função para gerar token no formato: números&NomeReal$ID
function generateToken(userId, userName) {
  const randomNumbers = Math.floor(1_000_000_000_000 + Math.random() * 8_999_999_999_999); // Gera número de 12 dígitos
  return `${randomNumbers}&${userName}$${userId}`;
}

client.on('guildMemberAdd', async (member) => {
  try {
    // Lista de IDs dos cargos que você deseja atribuir
    const cargoIds = ['1205331695482703903', '1311850100519075950']; // Substitua pelos IDs dos cargos desejados

    // Atribuindo cada cargo ao membro
    for (const cargoId of cargoIds) {
      const cargo = member.guild.roles.cache.get(cargoId);

      if (!cargo) {
        console.log(`Cargo com ID ${cargoId} não encontrado.`);
        continue;
      }

      await member.roles.add(cargo);
    }

  } catch (err) {
    console.error('Erro ao atribuir cargos:', err);
  }
});

const botsRootDirectory = './src/bots/Free/';
const apiDirectory = './src/API/';
const maxRamUsage = 100 * 1024 * 1024; // Limite de 100 MB (em bytes)
const sentAlerts = new Set(); // Rastreia alertas enviados
const webhookURL = "https://discord.com/api/webhooks/1320909103878635651/yl738SE_TqPv3nmv43A__7WjpO9HIUx8skbpMJ5B0qglaNlyaqCBvqjHPsJsuGZN-Nvc";
const avatarLink = "https://cdn.discordapp.com/avatars/1311795032818323507/3748cc6e27290d2a7c7506fb67aeb5b4.webp?size=2048";

/**
 * Envia alerta no Discord via webhook.
 */
async function sendAlert(userID, message) {
    if (!sentAlerts.has(message)) {
        sentAlerts.add(message); // Marca o alerta como enviado

        const payload = {
            username: 'root',
            avatar_url: avatarLink,
            content: `<@${userID}> ${message}`,
        };

        try {
            await axios.post(webhookURL, payload);
        } catch (error) {
            console.error('[ERRO] Falha ao enviar alerta:', error.message);
        }
    }
}

/**
 * Lê o arquivo API.json e retorna a lista de APIs bloqueadas.
 */
function getBlockedAPIs() {
    const apiFilePath = path.join(apiDirectory, 'api.json');
    let blockedAPIs = [];

    try {
        const apiContent = fs.readFileSync(apiFilePath, 'utf8');
        const apiData = JSON.parse(apiContent);
        blockedAPIs = apiData.API || [];
    } catch (error) {
        console.error('[ERRO] Não foi possível ler ou parsear o arquivo api.json:', error.message);
    }

    return blockedAPIs;
}

/**
 * Monitora o uso de RAM por bot usando o módulo pidusage.
 */
async function monitorRamUsage() {
    const userDirectories = fs.readdirSync(botsRootDirectory);

    for (const userID of userDirectories) {
        const userPath = path.join(botsRootDirectory, userID);

        if (fs.statSync(userPath).isDirectory()) {
            const botFiles = ['main.js', 'index.js', 'main.py', 'index.py'];
            const botFile = botFiles.find(file => fs.existsSync(path.join(userPath, file)));

            if (botFile) {
                const fullBotPath = path.join(userPath, botFile);
                const runningProcesses = [];

                // Obtém processos relacionados ao arquivo do bot
                try {
                    const ps = require('child_process');
                    const result = ps.execSync(`pgrep -fl ${botFile}`).toString();

                    result.split('\n').forEach(line => {
                        const parts = line.trim().split(/\s+/);
                        const pid = parseInt(parts[0], 10);
                        if (!isNaN(pid)) runningProcesses.push(pid);
                    });

                    // Monitora cada processo encontrado
                    for (const pid of runningProcesses) {
                        const stats = await pidusage(pid);

                        const ramUsage = stats.memory; // RAM usada em bytes
                        if (ramUsage > maxRamUsage) {
                            console.log(`[ALERTA] O bot do usuário ${userID} está usando muita RAM (${ramUsage} bytes).`);
                            sendAlert(userID, 'O App caiu por falta de RAM.');
                        }
                    }
                } catch (err) {
                    console.error(`[ERRO] Não foi possível monitorar o bot do usuário ${userID}:`, err.message);
                }
            }
        }
    }
}

/**
 * Verifica se algum arquivo ou pasta nos bots usa uma API bloqueada.
 */
function checkBotAPIs() {
    const blockedAPIs = getBlockedAPIs(); // Obtém as APIs bloqueadas
    const userDirectories = fs.readdirSync(botsRootDirectory);
    
    userDirectories.forEach(userID => {
        const userPath = path.join(botsRootDirectory, userID);

        if (fs.statSync(userPath).isDirectory()) {
            // Verifica se o nome de alguma pasta ou arquivo contém o nome de API bloqueada
            fs.readdirSync(userPath).forEach(item => {
                // Verifica arquivos e pastas
                const itemPath = path.join(userPath, item);
                blockedAPIs.forEach(blockedAPI => {
                    if (item.includes(blockedAPI)) {
                        sendAlert(userID, `O bot está usando uma API bloqueada ou pasta com nome suspeito: ${item}`);
                    }
                });

                // Se for diretório, entra nele e verifica os arquivos também
                if (fs.statSync(itemPath).isDirectory()) {
                    fs.readdirSync(itemPath).forEach(innerItem => {
                        blockedAPIs.forEach(blockedAPI => {
                            if (innerItem.includes(blockedAPI)) {
                                sendAlert(userID, `O bot está usando uma API bloqueada ou pasta com nome suspeito: ${innerItem}`);
                            }
                        });
                    });
                }
            });
        }
    });
}

/**
 * Monitoramento de erros nos bots, incluindo uso de API errada.
 */
function monitorBotErrors() {
    checkBotAPIs(); // Verifica se algum bot está usando APIs bloqueadas

    const userDirectories = fs.readdirSync(botsRootDirectory);
    const blockedAPIs = getBlockedAPIs(); // Obtém as APIs bloqueadas

    userDirectories.forEach(userID => {
        const userPath = path.join(botsRootDirectory, userID);

        if (fs.statSync(userPath).isDirectory()) {
            // Verifica arquivos específicos para detectar bots em Python ou Node.js
            const botFilePaths = {
                node: ['main.js', 'index.js'],
                python: ['main.py', 'index.py'],
                config: ['config.json']
            };

            for (const [type, files] of Object.entries(botFilePaths)) {
                for (const file of files) {
                    const botFile = path.join(userPath, file);
                    if (fs.existsSync(botFile)) {
                        // Lê o arquivo para detectar erros no código
                        try {
                            const fileContent = fs.readFileSync(botFile, 'utf8');
                            
                            if (fileContent.includes('SyntaxError') || fileContent.includes('Error')) {
                                sendAlert(userID, `<@${userID}> O App caiu devido a um erro no código.`);
                            }

                            // Verifica se o bot usa uma API bloqueada
                            blockedAPIs.forEach(api => {
                                if (fileContent.includes(api)) {
                                    sendAlert(userID, `<@${userID}> O bot está usando uma API bloqueada: ${api}`);
                                }
                            });
                        } catch (error) {
                            console.error('[ERRO] Falha ao ler o arquivo:', error.message);
                        }
                        
                        break; // Encerra a busca ao encontrar um arquivo válido
                    }
                }
            }
        }
    });
}

// Executa as verificações periodicamente
setInterval(() => {
    monitorRamUsage();  // Verifica o uso de RAM dos bots
    monitorBotErrors(); // Verifica erros no código e APIs bloqueadas
}, 10000); // Executa a cada 10 segundos

// Configuração de planos (apenas o plano Free)
const plans = {
    bots_free: { ramLimit: 100, botLimit: 1 },
};

const apiStatus = {
    Free: true,
};

const apiStatusv1 = {
    'Free': true,
};

function getUserPlan(member) {
    return plans.bots_free; // Retorna o plano Free sem verificar o cargo
}

function getUserPlan2(member) {
    if (!member) return null; // Verifica se o membro é válido
    // Verifica se o usuário tem o cargo de Free (apenas o cargo Free é permitido)
    if (member.roles.cache.some(role => role.name === '『🆓』Free')) {
        return { api: 'Free', permissions: [] }; // Retorna o plano Free sem permissões adicionais
    }
    return null; // Não permite se não tiver o cargo Free
}

// Listener de eventos de mensagens
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userId = message.author.id;
    const member = message.guild.members.cache.get(userId);
    const plan = getUserPlan(member); // Obtem o plano do usuário
    const apiName = 'Free';
    const apiFunctional = apiStatusv1[apiName]; // Verifica se a API está funcional na versão v1
    const apiFunctional2 = apiStatus[apiName]; // Verifica se a API está funcional na versão atual
    const allowedChannelIds = config.allowedChannelIds; // Um array de IDs de canais permitidos
    if (!allowedChannelIds.includes(message.channel.id)) {
        return;
    }
    if (!plan) return message.reply('Você não possui permissão para hospedar bots.');
    const userDir = path.join(__dirname, 'src', 'bots', apiName, userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    const botFile = fs.readdirSync(userDir).find(file => file.endsWith('.js') || file.endsWith('.py'));

    switch (command) {
case `${config.prefix}ajudar`:
case `${config.prefix}help`: {
    try {
        // Lista de comandos e suas descrições
        const cmds = [
            { nome: `${config.prefix}help`, descricao: 'Exibe a lista de comandos.' },
            { nome: `${config.prefix}ping`, descricao: 'Verifica a latência do bot.' },
            { nome: `${config.prefix}start`, descricao: 'Iniciar sua Aplicação i, iniciar' },
            { nome: `${config.prefix}stop`, descricao: 'Parar Aplicação p, para, .s' },
            { nome: `${config.prefix}restart`, descricao: 'Resetar Aplicação .r' },
            { nome: `${config.prefix}apps`, descricao: 'Veja Informações da sua Aplicação' },
            { nome: `${config.prefix}dir`, descricao: 'Veja seu diretório **Em Breve**' },
            { nome: `${config.prefix}upload`, descricao: 'Faça upload da sua aplicação .up' },
            { nome: `${config.prefix}commit`, descricao: 'Faça commit na aplicação .c' },
            { nome: `${config.prefix}backup`, descricao: 'Faça um backup da sua aplicação .b' },
            { nome: `${config.prefix}logs`, descricao: 'Veja as logs da sua aplicação' },
            { nome: `${config.prefix}apagar`, descricao: 'Apagar sua aplicação .rb' }
        ];

        // Criação do Embed para enviar os comandos
        const helpEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Lista de Comandos')
            .setFooter({ text: 'RedCloud' });

        // Adiciona os comandos ao Embed
        cmds.forEach((cmd) => {
            helpEmbed.addFields({ name: cmd.nome, value: cmd.descricao });
        });

        // Envia o Embed na DM do usuário
        await message.author.send({ embeds: [helpEmbed] });

        // Responde no canal original informando que a DM foi enviada
        await message.reply(`${emoji.emoji2} | Mensagem enviada em seu privado!`);
    } catch (error) {
        // Caso haja algum erro, informa o usuário
        message.reply('❌ | Não consegui enviar a mensagem na sua DM. Certifique-se de que está habilitada.');
        console.error('Erro ao enviar a mensagem:', error);
    }
    }
break;
case `${config.prefix}api`: {
  const userId = message.author.id; // ID do usuário que chamou o comando
  const userName = message.author.username; // Nome de usuário no Discord

  // Procurar o usuário no MongoDB
  UserModel.findOne({ userId }, async (err, existingUser) => {
    if (err) {
      console.error("Erro ao verificar usuário:", err);
      return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
    }

    if (existingUser) {
      // Token do usuário encontrado no banco de dados
      const apiToken = existingUser.apiToken;

      // Enviar o token diretamente para o usuário no privado
      return message.author.send(`Seu Token: **${apiToken}**`).catch(() => {
        message.reply('❌ | Não consegui enviar uma mensagem no privado. Por favor, habilite mensagens diretas e tente novamente.');
      });
    } else {
      // Caso o usuário não esteja registrado
      return message.reply("❌ | Você ainda não está registrado em nossa hospedagem. Use o comando de vinculação para registrar.");
    }
  message.reply(`${emoji.emoji2} | Message enviada com sucesso!`)
  });
}
break;
case `${config.prefix}vincular`: {
  const userId = message.author.id; // ID do usuário
  const userName = message.author.username; // Nome de usuário no Discord

  // Verificar se o usuário já está registrado no MongoDB
  UserModel.findOne({ userId }, async (err, existingUser) => {
    if (err) {
      console.error("Erro ao verificar usuário:", err);
      return message.reply("❌ | Ocorreu um erro ao acessar o banco de dados.");
    }

    if (existingUser) {
      return message.author.send(`${emoji.emoji2} | Você já está vinculado à nossa hospedagem.`).catch(() => {
        message.reply('❌ | Não consegui enviar uma mensagem no privado. Por favor, habilite mensagens diretas e tente novamente.');
      });
    }

    // Criar novo usuário
    const apiToken = generateToken(userId, userName); // Gera token com nome real e ID
    const newUser = new UserModel({
      userId,
      userName,
      registrationDate: new Date(),
      apiToken,
    });

    // Salvar no MongoDB
    try {
      await newUser.save();
      message.reply(`${emoji.emoji2} | Mensagem enviada com sucesso!`);

      // Enviar mensagem de confirmação no privado com o token
      message.author.send(
        `${emoji.emoji2} | Você foi vinculado com sucesso à nossa hospedagem! Obrigado por se cadastrar.\n\n`
      ).catch(() => {
        message.reply('❌ | Não consegui enviar uma mensagem no privado. Por favor, habilite mensagens diretas e tente novamente.');
      });
    } catch (error) {
      console.error("Erro ao salvar usuário no MongoDB:", error);
      message.reply("❌ | Ocorreu um erro ao salvar as informações no banco de dados.");
    }
  });
}
break;
case `${config.prefix}iniciar`:
case `${config.prefix}i`:
case `${config.prefix}start`: {
    if (!isHostActive) {
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }

    const userId = message.author.id;

    UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

        if (!apiFunctional && !apiFunctional2) {
            return message.reply(`A API \`${apiName}\` está desativada. Não é possível executar este comando.`);
        }

        const userDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id);

        // Verificar o arquivo de configuração `redcloud.config`
        const configFilePath = path.join(userDir, 'redcloud.config');
        if (!fs.existsSync(configFilePath)) {
            return message.reply('❌ | Arquivo de configuração `redcloud.config` não encontrado. Certifique-se de enviá-lo.');
        }

        const configContent = fs.readFileSync(configFilePath, 'utf8');
        const mainFileMatch = configContent.match(/^MAIN=(.+)$/m);

        if (!mainFileMatch || !mainFileMatch[1]) {
            return message.reply('❌ | Configuração inválida no arquivo `redcloud.config`. Certifique-se de definir `MAIN=<arquivo_principal>`.');
        }

        const mainFile = mainFileMatch[1];
        const botFilePath = path.join(userDir, mainFile);

        if (!fs.existsSync(botFilePath)) {
            return message.reply(`❌ | Arquivo principal \`${mainFile}\` não encontrado.`);
        }

        const plan = getUserPlan(message.guild.members.cache.get(message.author.id));

        // Verificar se o bot já está rodando
        if (userBots[message.author.id]?.main?.process) {
            return message.reply(`${emoji.emoji2} | Bot principal já está rodando.`);
        }

        // Criar o diretório de logs para o usuário
        const userLogDir = path.join(userDir, 'logs');
        if (!fs.existsSync(userLogDir)) {
            fs.mkdirSync(userLogDir, { recursive: true });
        }

        // Caminho para o arquivo de log exclusivo
        const userLogFilePath = path.join(userLogDir, `bot_logs_${Date.now()}.txt`);

        // Mapear linguagens e comandos para execução
        const languageCommands = {
            js: 'node',
            ts: 'ts-node',
            py: 'python3',
            php: 'php',
            rs: 'cargo run',
            ex: 'elixir',
            java: 'java',
            go: 'go run',
        };

        const fileExtension = path.extname(mainFile).substring(1); // Pega a extensão sem o ponto
        const command = languageCommands[fileExtension];

        if (!command) {
            return message.reply(`❌ | Linguagem não suportada para o arquivo \`${mainFile}\`.`);
        }

        // Iniciar o processo do bot
        const botProcess = spawn(command, [botFilePath], { cwd: path.dirname(botFilePath), detached: true });

        // Salvar o processo no objeto userBots
        userBots[message.author.id] = {
            main: { process: botProcess, logFilePath: userLogFilePath },
        };

        // Função para salvar logs exclusivamente para este bot
        const saveLogs = (data, type) => {
            const logMessage = `[${new Date().toISOString()}] [${type}] ${data.toString().trim()}`;
            fs.appendFile(userLogFilePath, `${logMessage}\n`, (err) => {
                if (err) console.error('Erro ao salvar log:', err);
            });
        };

        // Ouvintes exclusivos para capturar logs
        botProcess.stdout.on('data', (data) => saveLogs(data, 'STDOUT'));
        botProcess.stderr.on('data', (data) => saveLogs(data, 'STDERR'));

        // Garantir que o processo seja limpo ao encerrar
        botProcess.on('close', (code) => {
            delete userBots[message.author.id];
        });

        return message.reply(`${emoji.emoji2} | Bot principal \`${mainFile}\` iniciado com sucesso.`);
    });
}
break;
case `${config.prefix}s`:
case `${config.prefix}para`:
case `${config.prefix}p`:
case `${config.prefix}stop`: {
    if (!isHostActive) {
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }

    const userId = message.author.id;

    UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

        if (!apiFunctional && !apiFunctional2) {
            return message.reply(`A API \`${apiName}\` está desativada. Não é possível executar este comando.`);
        }

        const userDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id);

        // Caminho do arquivo redcloud.config
        const configPath = path.join(userDir, 'redcloud.config');

        // Verificar se o arquivo redcloud.config existe
        if (!fs.existsSync(configPath)) {
            return message.reply('❌ | Arquivo `redcloud.config` não encontrado. Verifique se ele foi enviado corretamente.');
        }

        // Ler o arquivo redcloud.config e extrair o valor de MAIN
        let mainFile;
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const mainMatch = configContent.match(/^MAIN=(.+)$/m);
            if (mainMatch) {
                mainFile = mainMatch[1].trim();
            } else {
                return message.reply('❌ | A configuração `MAIN` não foi encontrada no arquivo `redcloud.config`.');
            }
        } catch (error) {
            console.error('Erro ao ler o arquivo redcloud.config:', error);
            return message.reply('❌ | Ocorreu um erro ao tentar ler o arquivo `redcloud.config`.');
        }

        // Caminho completo do arquivo principal
        const mainFilePath = path.join(userDir, mainFile);

        // Verificar se o arquivo principal existe
        if (!fs.existsSync(mainFilePath)) {
            return message.reply(`❌ | O arquivo principal definido (${mainFile}) não foi encontrado.`);
        }

        // Verificar se o bot está rodando
        if (!userBots[userId]?.main?.process) {
            return message.reply('❌ | Bot principal não está rodando.');
        }

        // Parar o processo do bot
        const process = userBots[userId].main.process;
        process.kill(); // Finaliza o processo atual
        delete userBots[userId].main; // Remove o bot da lista de bots ativos

        return message.reply(`${emoji.emoji2} | Bot foi parado com sucesso.`);
    });
}
break;
case `${config.prefix}r`:
case `${config.prefix}restart`: {
    if (!isHostActive) {
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }

    const userId = message.author.id;

    UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

        if (!apiFunctional && !apiFunctional2) {
            return message.reply(`A API \`${apiName}\` está desativada. Não é possível executar este comando.`);
        }

        const userDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id);

        // Verificar se a pasta do usuário existe
        if (!fs.existsSync(userDir)) {
            return message.reply('❌ | Diretório do bot não encontrado. Certifique-se de ter enviado sua aplicação.');
        }

        // Verificar o arquivo de configuração `redcloud.config`
        const configFilePath = path.join(userDir, 'redcloud.config');
        if (!fs.existsSync(configFilePath)) {
            return message.reply('❌ | Arquivo de configuração `redcloud.config` não encontrado. Certifique-se de enviá-lo.');
        }

        const configContent = fs.readFileSync(configFilePath, 'utf8');
        const mainFileMatch = configContent.match(/^MAIN=(.+)$/m);

        if (!mainFileMatch || !mainFileMatch[1]) {
            return message.reply('❌ | Configuração inválida no arquivo `redcloud.config`. Certifique-se de definir `MAIN=<arquivo_principal>`.');
        }

        const mainFile = mainFileMatch[1];
        const botFilePath = path.join(userDir, mainFile);

        if (!fs.existsSync(botFilePath)) {
            return message.reply(`❌ | Arquivo principal \`${mainFile}\` não encontrado.`);
        }

        // Parar o bot se estiver rodando
        if (userBots[userId]?.main?.process) {
            try {
                const process = userBots[userId].main.process;
                process.kill(); // Parar o processo atual
                delete userBots[userId]; // Remover o bot da lista de bots ativos
            } catch (err) {
                console.error('Erro ao parar o processo:', err);
                return message.reply('❌ | Ocorreu um erro ao parar o bot principal.');
            }
        }

        // Criar o diretório de logs para o usuário
        const userLogDir = path.join(userDir, 'logs');
        if (!fs.existsSync(userLogDir)) {
            fs.mkdirSync(userLogDir, { recursive: true });
        }

        // Caminho para o arquivo de log exclusivo
        const userLogFilePath = path.join(userLogDir, `bot_logs_${Date.now()}.txt`);

        // Mapear linguagens e comandos para execução
        const languageCommands = {
            js: 'node',
            ts: 'ts-node',
            py: 'python3',
            php: 'php',
            rs: 'cargo run',
            ex: 'elixir',
            java: 'java',
            go: 'go run',
        };

        const fileExtension = path.extname(mainFile).substring(1); // Pega a extensão sem o ponto
        const command = languageCommands[fileExtension];

        if (!command) {
            return message.reply(`❌ | Linguagem não suportada para o arquivo \`${mainFile}\`.`);
        }

        // Iniciar o processo do bot
        const botProcess = spawn(command, [botFilePath], { cwd: path.dirname(botFilePath), detached: true });

        // Salvar o processo no objeto userBots
        userBots[userId] = {
            main: { process: botProcess, logFilePath: userLogFilePath },
        };

        // Função para salvar logs exclusivamente para este bot
        const saveLogs = (data, type) => {
            const logMessage = `[${new Date().toISOString()}] [${type}] ${data.toString().trim()}`;
            fs.appendFile(userLogFilePath, `${logMessage}\n`, (err) => {
                if (err) console.error('Erro ao salvar log:', err);
            });
        };

        // Ouvintes exclusivos para capturar logs
        botProcess.stdout.on('data', (data) => saveLogs(data, 'STDOUT'));
        botProcess.stderr.on('data', (data) => saveLogs(data, 'STDERR'));

        // Garantir que o processo seja limpo ao encerrar
        botProcess.on('close', (code) => {
            delete userBots[userId];
        });

        return message.reply(`${emoji.emoji2} | Bot principal \`${mainFile}\` reiniciado com sucesso.`);
    });
}
break;
case `${config.prefix}apt`: {
    const userId = message.author.id;
    const userDir = path.join(__dirname, 'src', 'bots', 'Free', userId);
    const npmPackagePath = path.join(userDir, 'package.json');
    const pythonRequirementsPath = path.join(userDir, 'requirements.txt');
    const rubyGemfilePath = path.join(userDir, 'Gemfile');
    const goModPath = path.join(userDir, 'go.mod');
    const javaPomPath = path.join(userDir, 'pom.xml');
    const phpComposerPath = path.join(userDir, 'composer.json');
    const rustCargoPath = path.join(userDir, 'Cargo.toml');
    const elixirMixPath = path.join(userDir, 'mix.exs');

    // Função para verificar dependências no requirements.txt (Python)
    const parseRequirements = () => {
        if (!fs.existsSync(pythonRequirementsPath)) return null;
        const data = fs.readFileSync(pythonRequirementsPath, 'utf8');
        return data.split('\n')
            .filter((line) => line.trim() && !line.startsWith('#'))
            .map((line) => {
                const [name, version] = line.split('==');
                return { name: name.trim(), version: version?.trim() || 'latest' };
            });
    };

    // Função para verificar dependências no package.json (NPM)
    const parsePackageJson = () => {
        if (!fs.existsSync(npmPackagePath)) return null;
        const packageData = JSON.parse(fs.readFileSync(npmPackagePath, 'utf8'));
        const dependencies = packageData.dependencies || {};
        const devDependencies = packageData.devDependencies || {};
        return Object.entries({ ...dependencies, ...devDependencies }).map(([name, version]) => ({ name, version }));
    };

    // Função para verificar dependências no Gemfile (Ruby)
    const parseGemfile = () => {
        if (!fs.existsSync(rubyGemfilePath)) return null;
        const data = fs.readFileSync(rubyGemfilePath, 'utf8');
        return data.split('\n')
            .filter((line) => line.trim() && !line.startsWith('#'))
            .map((line) => {
                const [name, version] = line.split(' ');
                return { name: name.trim(), version: version?.trim() || 'latest' };
            });
    };

    // Função para verificar dependências no go.mod (Go)
    const parseGoMod = () => {
        if (!fs.existsSync(goModPath)) return null;
        const data = fs.readFileSync(goModPath, 'utf8');
        return data.split('\n')
            .filter((line) => line.trim() && line.startsWith('require'))
            .map((line) => {
                const [name, version] = line.split(' ').slice(1);
                return { name, version: version?.trim() || 'latest' };
            });
    };

    // Função para verificar dependências no pom.xml (Java)
    const parsePomXml = () => {
        if (!fs.existsSync(javaPomPath)) return null;
        const data = fs.readFileSync(javaPomPath, 'utf8');
        // Você pode usar um parser XML real aqui para pegar as dependências, por exemplo, `xml2js`
        return [];
    };

    // Função para verificar dependências no composer.json (PHP)
    const parseComposerJson = () => {
        if (!fs.existsSync(phpComposerPath)) return null;
        const data = fs.readFileSync(phpComposerPath, 'utf8');
        const composerData = JSON.parse(data);
        const dependencies = composerData.require || {};
        return Object.entries(dependencies).map(([name, version]) => ({ name, version }));
    };

    // Função para verificar dependências no Cargo.toml (Rust)
    const parseCargoToml = () => {
        if (!fs.existsSync(rustCargoPath)) return null;
        const data = fs.readFileSync(rustCargoPath, 'utf8');
        // Você pode usar regex ou algum parser TOML para pegar as dependências
        return [];
    };

    // Função para verificar dependências no mix.exs (Elixir)
    const parseMixExs = () => {
        if (!fs.existsSync(elixirMixPath)) return null;
        const data = fs.readFileSync(elixirMixPath, 'utf8');
        // Você pode usar regex ou algum parser para capturar as dependências
        return [];
    };

    // Obter dependências de cada linguagem
    const npmDependencies = parsePackageJson();
    const pythonDependencies = parseRequirements();
    const rubyDependencies = parseGemfile();
    const goDependencies = parseGoMod();
    const javaDependencies = parsePomXml();
    const phpDependencies = parseComposerJson();
    const rustDependencies = parseCargoToml();
    const elixirDependencies = parseMixExs();

    // Exibir informações de dependências
    const createDependencyText = (dependencies, language) => {
        if (!dependencies || dependencies.length === 0) return `Nenhuma dependência encontrada no ${language}.`;
        return dependencies.map(dep => `📦 | ${dep.name}: ${dep.version}`).join('\n');
    };

    const npmInfo = createDependencyText(npmDependencies, 'package.json (NPM)');
    const pythonInfo = createDependencyText(pythonDependencies, 'requirements.txt (Python)');
    const rubyInfo = createDependencyText(rubyDependencies, 'Gemfile (Ruby)');
    const goInfo = createDependencyText(goDependencies, 'go.mod (Go)');
    const javaInfo = createDependencyText(javaDependencies, 'pom.xml (Java)');
    const phpInfo = createDependencyText(phpDependencies, 'composer.json (PHP)');
    const rustInfo = createDependencyText(rustDependencies, 'Cargo.toml (Rust)');
    const elixirInfo = createDependencyText(elixirDependencies, 'mix.exs (Elixir)');

    const modal = new ModalBuilder()
        .setCustomId('aptModal')
        .setTitle('📦 Informações das Dependências');

    // Criar os campos de texto para cada linguagem
    const npmTextInput = new TextInputBuilder().setCustomId('npmDependencies').setLabel('Dependências (NPM)').setStyle(TextInputStyle.Paragraph).setValue(npmInfo);
    const pythonTextInput = new TextInputBuilder().setCustomId('pythonDependencies').setLabel('Dependências (Python)').setStyle(TextInputStyle.Paragraph).setValue(pythonInfo);
    const rubyTextInput = new TextInputBuilder().setCustomId('rubyDependencies').setLabel('Dependências (Ruby)').setStyle(TextInputStyle.Paragraph).setValue(rubyInfo);
    const goTextInput = new TextInputBuilder().setCustomId('goDependencies').setLabel('Dependências (Go)').setStyle(TextInputStyle.Paragraph).setValue(goInfo);
    const javaTextInput = new TextInputBuilder().setCustomId('javaDependencies').setLabel('Dependências (Java)').setStyle(TextInputStyle.Paragraph).setValue(javaInfo);
    const phpTextInput = new TextInputBuilder().setCustomId('phpDependencies').setLabel('Dependências (PHP)').setStyle(TextInputStyle.Paragraph).setValue(phpInfo);
    const rustTextInput = new TextInputBuilder().setCustomId('rustDependencies').setLabel('Dependências (Rust)').setStyle(TextInputStyle.Paragraph).setValue(rustInfo);
    const elixirTextInput = new TextInputBuilder().setCustomId('elixirDependencies').setLabel('Dependências (Elixir)').setStyle(TextInputStyle.Paragraph).setValue(elixirInfo);

    const row1 = new ActionRowBuilder().addComponents(npmTextInput);
    const row2 = new ActionRowBuilder().addComponents(pythonTextInput);
    const row3 = new ActionRowBuilder().addComponents(rubyTextInput);
    const row4 = new ActionRowBuilder().addComponents(goTextInput);
    const row5 = new ActionRowBuilder().addComponents(javaTextInput);
    const row6 = new ActionRowBuilder().addComponents(phpTextInput);
    const row7 = new ActionRowBuilder().addComponents(rustTextInput);
    const row8 = new ActionRowBuilder().addComponents(elixirTextInput);

    modal.addComponents(row1, row2, row3, row4, row5, row6, row7, row8);

    // Mostrar o modal para o usuário
    await message.showModal(modal);

    // Handler para verificar atualizações
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isModalSubmit() || interaction.customId !== 'aptModal') return;

        await interaction.reply("🔄 Verificando por atualizações...");

        // Funções para verificar atualizações podem ser adaptadas aqui para cada linguagem
        // Exemplo de verificação de atualizações para npm:
        const outdatedNpmDeps = [];
        if (npmDependencies) {
            for (const dep of npmDependencies) {
                try {
                    const { data } = await axios.get(`https://registry.npmjs.org/${dep.name}/latest`);
                    const latestVersion = data.version;
                    if (semver.gt(latestVersion, dep.version)) {
                        outdatedNpmDeps.push(`📦 | ${dep.name}: ${dep.version} → ${latestVersion}`);
                    }
                } catch (error) {
                    console.error(`Erro ao verificar versão do módulo ${dep.name}:`, error);
                }
            }
        }

        // Exibir os resultados das atualizações para o usuário
        const npmResults = outdatedNpmDeps.length > 0
            ? `🔍 Atualizações disponíveis (NPM):\n${outdatedNpmDeps.join('\n')}`
            : '🎉 Todas as dependências NPM estão atualizadas!';

        interaction.followUp(npmResults);
    });
}
break;
case `${config.prefix}apps`: {
    if (!isHostActive) {
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }

    UserModel.findOne({ userId: message.author.id }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

        if (!apiFunctional && !apiFunctional2) {
            return message.reply(`A API \`${apiName}\` está desativada. Não é possível listar os bots.`);
        }

        const userDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id);
        const validFiles = ['main.js', 'index.js', 'main.py', 'index.py'];

        if (!fs.existsSync(userDir)) {
            return message.reply('❌ | Bot principal não encontrado. Use `.up` para enviar sua aplicação.');
        }

        const checkBotFilesExist = () => {
            return validFiles.some(file => fs.existsSync(path.join(userDir, file)));
        };

        if (!checkBotFilesExist()) {
            return message.reply('❌ | Nenhum arquivo válido encontrado na sua pasta de bots.');
        }

        const configFilePath = path.join(userDir, 'redcloud.config');
        if (!fs.existsSync(configFilePath)) {
            return message.reply('❌ | O arquivo `redcloud.config` não foi encontrado na pasta do seu bot.');
        }

        const getMainFileFromConfig = (configFilePath) => {
            const configLines = fs.readFileSync(configFilePath, 'utf-8').split('\n');
            for (let line of configLines) {
                line = line.trim();
                if (line.startsWith('MAIN=')) {
                    return line.replace('MAIN=', '').trim();
                }
            }
            return null;
        };

        const mainFile = getMainFileFromConfig(configFilePath);
        if (!mainFile) {
            return message.reply('❌ | O arquivo `redcloud.config` não define o arquivo principal (MAIN).');
        }

        const mainFilePath = path.join(userDir, mainFile);

        if (!fs.existsSync(mainFilePath)) {
            return message.reply(`❌ | O arquivo principal configurado (\`${mainFile}\`) não foi encontrado.`);
        }

        const checkBotStatus = (userId) => {
            const isProcessRunning = userBots[userId]?.main?.process;
            return isProcessRunning ? "Online" : "Offline";
        };

        const calculateRAM = async (userId) => {
            const botProcess = userBots[userId]?.main?.process;

            if (botProcess) {
                const pid = botProcess.pid; // Obtém o PID do processo do bot
                try {
                    const stats = await pidusage(pid);
                    const memoryUsageMB = Math.round(stats.memory / (1024 * 1024)); // Converte para MB
                    return `${memoryUsageMB}MB`;
                } catch (error) {
                    console.error(`Erro ao calcular RAM para o bot do usuário ${userId}:`, error.message);
                    return "N/A";
                }
            } else {
                return "N/A";
            }
        };

        const apps = [];

        const checkBots = async () => {
            try {
                const entries = fs.readdirSync(userDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isFile() && validFiles.includes(entry.name)) {
                        const ext = entry.name.split('.').pop();
                        const language = ext === 'js' ? '<:js:1311369265152262165> JavaScript' : '<:python:1315841028820959232> Python';

                        const ramUsage = await calculateRAM(message.author.id);

                        const appData = {
                            tipo: "Bot",
                            status: checkBotStatus(message.author.id),
                            linguagem: language,
                            arquivoPrincipal: mainFile,
                            ram: ramUsage,
                            cluster: "EUA-CA",
                        };

                        apps.push(appData);
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📜 Bots Hospedados')
                    .setTimestamp();

                apps.forEach(app => {
                    embed.addFields(
                        { name: `<:bot:1311368671171706900> \`Tipo:\``, value: app.tipo, inline: true },
                        { name: `<:status:1311369068326031501> \`Status:\``, value: app.status, inline: true },
                        { name: `\`Linguagem:\``, value: app.linguagem, inline: true },
                        { name: `<:pasta:1311370024900100156> \`Arquivo Principal:\``, value: app.arquivoPrincipal, inline: true },
                        { name: `<:ram:1311370349958533221> \`Memória RAM:\``, value: app.ram, inline: true },
                        { name: `<:cluster:1314849839514648576> \`Cluster:\``, value: app.cluster, inline: true }
                    );
                });

                return message.reply({ embeds: [embed] });
            } catch (error) {
                console.error("Erro ao verificar bots:", error);
                return message.reply("❌ | Ocorreu um erro ao verificar os bots.");
            }
        };

        await checkBots();
    });
}
break;
case `${config.prefix}dir`: {
    if (!isHostActive) {
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }

    UserModel.findOne({ userId: message.author.id }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

        const baseDir = path.join(__dirname, 'src', 'bots', 'Free', message.author.id); // Diretório base do usuário
        let currentDir = baseDir; // Diretório atual (inicialmente o baseDir)

        // Função para listar arquivos
        const listFiles = (directory) => {
            const entries = fs.readdirSync(directory);
            return entries.map(file => ({
                name: file,
                path: path.join(directory, file),
                isDirectory: fs.statSync(path.join(directory, file)).isDirectory()
            }));
        };

        // Função para reiniciar o bot
        const restartBot = () => {
            if (userBots[message.author.id]) {
                const { process: botProcess } = userBots[message.author.id].main;
                botProcess.kill(); // Para o bot atual
            }

            const botFilePath = path.join(baseDir, 'index.js'); // Arquivo principal do bot
            const isPython = botFilePath.endsWith('.py');
            const command = isPython ? 'python3' : 'node';

            const botProcess = spawn(command, [botFilePath], { cwd: baseDir, detached: true });

            const logDir = path.join(baseDir, 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

            const logFilePath = path.join(logDir, `bot_logs_${Date.now()}.txt`);

            userBots[message.author.id] = {
                main: { process: botProcess, logFilePath },
            };

            botProcess.stdout.on('data', (data) => {
                fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] [STDOUT] ${data.toString()}\n`);
            });

            botProcess.stderr.on('data', (data) => {
                fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] [STDERR] ${data.toString()}\n`);
            });

            botProcess.on('close', () => {
                console.log(`Bot do usuário ${message.author.id} foi encerrado.`);
                delete userBots[message.author.id];
            });

        };

        // Função para enviar embed do diretório
        const sendDirectoryEmbed = () => {
            const files = listFiles(currentDir);
            const fileList = files.map(file => file.isDirectory ? `🗂️ ${file.name}` : `📄 ${file.name}`).join('\n');
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📁 Gerenciador de Diretórios')
                .setDescription(`Conteúdo do diretório:\n${fileList || 'Diretório vazio.'}`)
                .setFooter({ text: "Use os botões abaixo para navegar ou editar arquivos." });

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('navigate-up')
                        .setLabel('⬆️ Subir Diretório')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('edit-file')
                        .setLabel('✏️ Editar Arquivo')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('rename-file')
                        .setLabel('📝 Renomear Arquivo')
                        .setStyle(ButtonStyle.Secondary)
                );

            message.reply({ embeds: [embed], components: [buttons] });
        };

        // Interação com botões
        const filter = (interaction) => interaction.user.id === message.author.id;
        const collector = message.channel.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'navigate-up') {
                const parentDir = path.dirname(currentDir);
                if (parentDir.startsWith(baseDir)) {
                    currentDir = parentDir;
                    sendDirectoryEmbed();
                } else {
                    interaction.reply({ content: "⚠️ Você não pode subir além do diretório base!", ephemeral: true });
                }
            }

            if (interaction.customId === 'rename-file') {
                const modal = new ModalBuilder()
                    .setCustomId('rename-modal')
                    .setTitle('Renomear Arquivo')
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId('old-file-name')
                            .setLabel('Nome Atual do Arquivo')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short),
                        new TextInputBuilder()
                            .setCustomId('new-file-name')
                            .setLabel('Novo Nome do Arquivo')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short)
                    );

                await interaction.showModal(modal);
            }

            if (interaction.customId === 'edit-file') {
                const modal = new ModalBuilder()
                    .setCustomId('edit-modal')
                    .setTitle('Editar Arquivo')
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId('file-name')
                            .setLabel('Nome do Arquivo')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Short),
                        new TextInputBuilder()
                            .setCustomId('file-content')
                            .setLabel('Novo Conteúdo')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                    );

                await interaction.showModal(modal);
            }

            interaction.deferUpdate();
        });

        // Modal de edição ou renomeação
        client.on('interactionCreate', async (modalInteraction) => {
            if (!modalInteraction.isModalSubmit()) return;

            if (modalInteraction.customId === 'edit-modal') {
                const fileName = modalInteraction.fields.getTextInputValue('file-name');
                const filePath = path.join(currentDir, fileName);
                const content = modalInteraction.fields.getTextInputValue('file-content');

                if (fs.existsSync(filePath)) {
                    fs.writeFileSync(filePath, content, 'utf8');
                    modalInteraction.reply({ content: `✅ Arquivo \`${fileName}\` atualizado! Reiniciando o bot...`, ephemeral: true });
                    restartBot();
                }
            }

            if (modalInteraction.customId === 'rename-modal') {
                const oldName = modalInteraction.fields.getTextInputValue('old-file-name');
                const newName = modalInteraction.fields.getTextInputValue('new-file-name');
                const oldPath = path.join(currentDir, oldName);
                const newPath = path.join(currentDir, newName);

                if (fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                    modalInteraction.reply({ content: `✅ Arquivo renomeado para \`${newName}\`. Reiniciando o bot...`, ephemeral: true });
                    restartBot();
                }
            }
        });

        sendDirectoryEmbed();
    });
}
break;
case `${config.prefix}upload`:
case `${config.prefix}up`: {
    // Verificar se a hospedagem está ativa
    if (!isHostActive) {
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }
    
    if (isUploads) {
       return message.reply(`${emoji.emoji1} | No momento, estamos lidando com uma alta demanda de Bots em nosso plano gratuito.\nPara aproveitar os nossos serviços sem limitações, compre um de nossos planos premium, com preços a partir de apenas R$1.99.\nOu, se preferir, pode tentar novamente mais tarde.`);
    }
    UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

    const userDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id);

    // Função para verificar a existência de arquivos válidos na pasta do usuário
    const checkBotFilesExist = () => {
        const validFiles = ['main.js', 'index.js', 'main.py', 'index.py'];
        return validFiles.some(file => fs.existsSync(path.join(userDir, file)));
    };

    // Função para calcular o tamanho total dos arquivos na pasta
    const calculateFolderSize = (folderPath) => {
        let totalSize = 0;
        const files = fs.readdirSync(folderPath, { withFileTypes: true });

        for (const file of files) {
            const filePath = path.join(folderPath, file.name);
            if (file.isDirectory()) {
                totalSize += calculateFolderSize(filePath); // Recursivamente para pastas
            } else {
                totalSize += fs.statSync(filePath).size; // Tamanho do arquivo
            }
        }
        return totalSize;
    };

    // Verificar se o tamanho da pasta do usuário excede o limite de 100 MB
    if (fs.existsSync(userDir)) {
        const folderSizeInBytes = calculateFolderSize(userDir);
        const folderSizeInMB = folderSizeInBytes / (1024 * 1024); // Converter para MB

        if (folderSizeInMB > 100) {
            return message.reply(`🚫 O tamanho dos seus arquivos (${folderSizeInMB.toFixed(2)} MB) excede o limite permitido de 100 MB. Limpe a pasta para continuar.`);
        }
    }

    // Verificar se o usuário já tem um bot hospedado
    if (fs.existsSync(userDir) && checkBotFilesExist()) {
        return message.reply(`${emoji.emoji1} | Você já possui um bot hospedado. O plano Free permite apenas 1 bot principal.`);
    }

    // Verificar se o usuário já tem um ticket aberto
    const existingChannel = message.guild.channels.cache.find(
        channel => channel.name === `ticket-${message.author.id}` && channel.type === Discord.ChannelType.GuildText
    );

    if (existingChannel) {
        return message.reply(`${emoji.emoji1} | Você já possui um ticket aberto: ${existingChannel}. Continue por lá.`);
    }

    // Criar um novo canal de ticket
    message.guild.channels.create({
        name: `ticket-${message.author.id}`,
        type: Discord.ChannelType.GuildText,
        permissionOverwrites: [
            {
                id: message.guild.id, // Todos os usuários do servidor
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: message.author.id, // Usuário que abriu o ticket
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
        ],
    }).then(ticketChannel => {
    // Verificar se o usuário já tem um ticket aberto
    const existingChannel = message.guild.channels.cache.find(
        channel => channel.name === `ticket-${message.author.id}` && channel.type === Discord.ChannelType.GuildText
    );
        message.reply(`Acessar seu canal ${existingChannel}`);
        ticketChannel.send(`<@${message.author.id}>, envie seu arquivo compactado em formato \`.zip\`. Certifique-se de incluir o arquivo \`package.json\`.`);

        const filter = (msg) => msg.author.id === message.author.id && msg.attachments.size > 0;
        const collector = ticketChannel.createMessageCollector({ filter, time: 1000000 });

        collector.on('collect', async (msg) => {
            const attachment = msg.attachments.first();
            const fileName = attachment.name;
            const ext = path.extname(fileName);

            if (ext !== '.zip') {
                return ticketChannel.send(`${emoji.emoji1} | Apenas arquivos compactados em formato `.zip` são permitidos.`);
            }

            const filePath = path.join(userDir, fileName);
            const fileStream = fs.createWriteStream(filePath);

            https.get(attachment.url, (response) => {
                response.pipe(fileStream);
                fileStream.on('finish', async () => {
                    // Criação do diretório do usuário
                    fs.mkdirSync(userDir, { recursive: true });
                    fileStream.close();
                    ticketChannel.send(`Arquivo \`${fileName}\` recebido. Verificando conteúdo...`);

                    try {
                        // Verificar se o arquivo contém o 'redcloud.app'
                        const zip = new AdmZip(filePath);
                        const zipEntries = zip.getEntries();

                        const redcloudAppFile = zipEntries.find(entry => entry.entryName === 'redcloud.app');
                        if (!redcloudAppFile) {
                            ticketChannel.send(`${emoji.emoji1} | O arquivo \`redcloud.app\` não foi encontrado no arquivo compactado. O processo será cancelado.`);
                            setTimeout(() => {
                                    ticketChannel.delete();
                                }, 20000);
                            fs.rmSync(userDir, { recursive: true, force: true }); // Remover pasta do usuári
                            return;
                        }

                        // Extração do arquivo
                        await extract(filePath, { dir: userDir });
                        fs.unlinkSync(filePath);
                        
                        // Verificar existência do requirements.txt
                        const packagePath = path.join(userDir, 'package.json');
                        const requirementsPath = path.join(userDir, 'requirements.txt');
                        if (fs.existsSync(requirementsPath)) {
    ticketChannel.send('Arquivo `requirements.txt` detectado. Dependências serão instaladas automaticamente.');

    // Instalar dependências
    ticketChannel.send('Instalando dependências. Isso pode levar alguns minutos...');
    
    const npmProcess = exec('python3 -m pip install -r requirements.txt', { cwd: userDir });

    npmProcess.stdout.on('data', (data) => {
        console.log(data); // Se precisar fazer algo com a saída da instalação
    });

    npmProcess.stderr.on('data', (data) => {
        console.error(`${emoji.emoji1} | Erro na instalação das dependências: `, data); // Log de erros
    });

    npmProcess.on('close', (code) => {
        if (code !== 0) {
            ticketChannel.send('Ocorreu um erro ao instalar as dependências. Tente novamente mais tarde.');
            fs.rmSync(userDir, { recursive: true, force: true }); // Remover pasta do usuário
            setTimeout(() => {
                ticketChannel.delete();
            }, 20000); // Reduzido o tempo para evitar problemas com tickets
            return;
        }

        ticketChannel.send(`${emoji.emoji2} | Dependências instaladas com sucesso!`);

        // Iniciar o bot
        const botFilePath = path.join(userDir, 'index.py'); // Ou use o nome que desejar
        const botProcess = spawn('python3', [botFilePath], { cwd: userDir });
        
        userBots[message.author.id] = {
            mainFile: 'index.py',
            process: botProcess,
        };

        botProcess.stdout.on('data', (data) => {
            // Processamento da saída do bot
        });

        botProcess.stderr.on('data', (data) => {
            // Processamento dos erros do bot
        });

        botProcess.on('close', (code) => {
            // Gerenciamento do fechamento do processo do bot
        });

        // Criar o diretório de logs para o usuário
        const userLogDir = path.join(userDir, 'logs');
        if (!fs.existsSync(userLogDir)) {
            fs.mkdirSync(userLogDir, { recursive: true });
        }

        // Caminho para o arquivo de log
        const userLogFilePath = path.join(userLogDir, `bot_logs_${Date.now()}.txt`);

        // Função para salvar logs
        const saveLogs = (data, type) => {
            const logMessage = `[${new Date().toISOString()}] [${type}] ${data.toString().trim()}`;
            fs.appendFile(userLogFilePath, `${logMessage}\n`, (err) => {
                if (err) console.error('Erro ao salvar log:', err);
            });
        };

        botProcess.stdout.on('data', (data) => saveLogs(data, 'STDOUT'));
        botProcess.stderr.on('data', (data) => saveLogs(data, 'STDERR'));

        // Fechar o ticket após o sucesso
        ticketChannel.send(`${emoji.emoji2} | Bot iniciado com sucesso!`);
        
        // Fechar o canal após 5 segundos
        setTimeout(() => {
            ticketChannel.delete();
        }, 20000); // Reduzido o tempo para evitar problemas com tickets
    });
} else if(fs.existsSync(packagePath)) {
                            const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
                            ticketChannel.send(`Arquivo \`package.json\` detectado. Dependências serão instaladas automaticamente.`);

                            // Instalar dependências
                            ticketChannel.send('Instalando dependências. Isso pode levar alguns minutos...');
                            const npmProcess = exec('npm install', { cwd: userDir });

                            npmProcess.stdout.on('data', (data) => {
                            });

                            npmProcess.stderr.on('data', (data) => {
                            });

                            npmProcess.on('close', (code) => {
                                if (code !== 0) {
                ticketChannel.send(`${emoji.emoji1} | Ocorreu um erro ao instalar as dependências. Tente novamente mais tarde.`);
            fs.rmSync(userDir, { recursive: true, force: true }); // Remover pasta do usuário
            setTimeout(() => {
                ticketChannel.delete();
            }, 20000); // Reduzido o tempo para evitar problemas com tickets
            return;
                                }

                                ticketChannel.send(`${emoji.emoji2} | Dependências instaladas com sucesso!`);

                                // Iniciar o bot
                                const botFilePath = path.join(userDir, packageData.main || 'index.js');
                                const botProcess = spawn('node', [botFilePath], { cwd: userDir });
                                userBots[message.author.id] = {
                                    mainFile: packageData.main || 'index.js',
                                    dependencies: packageData.dependencies || {},
                                    api: 'free', // Apenas Free
                                    process: botProcess,
                                };

                                botProcess.stdout.on('data', (data) => {
                                    // Processamento da saída do bot
                                });

                                botProcess.stderr.on('data', (data) => {
                                    // Processamento dos erros do bot
                                });

                                botProcess.on('close', (code) => {
                                    // Gerenciamento do fechamento do processo do bot
                                });
                                
                                // Criar o diretório de logs para o usuário
    const userLogDir = path.join(userDir, 'logs');
    if (!fs.existsSync(userLogDir)) {
        fs.mkdirSync(userLogDir, { recursive: true });
    }

    // Caminho para o arquivo de log exclusivo
    const userLogFilePath = path.join(userLogDir, `bot_logs_${Date.now()}.txt`);
                                
                                // Salvar o processo no objeto userBots
    userBots[message.author.id] = {
        main: { process: botProcess, logFilePath: userLogFilePath },
    };

    // Função para salvar logs exclusivamente para este bot
    const saveLogs = (data, type) => {
        const logMessage = `[${new Date().toISOString()}] [${type}] ${data.toString().trim()}`;
        fs.appendFile(userLogFilePath, `${logMessage}\n`, (err) => {
            if (err) console.error('Erro ao salvar log:', err);
        });
    };

    // Ouvintes exclusivos para capturar logs
    botProcess.stdout.on('data', (data) => saveLogs(data, 'STDOUT'));
    botProcess.stderr.on('data', (data) => saveLogs(data, 'STDERR'));

                                // Fechar o ticket
                                ticketChannel.send(`${emoji.emoji2} | Bot iniciado com sucesso!`);
                                
                                // Fechar o canal após 5 segundos
                                setTimeout(() => {
                                    ticketChannel.delete();
                                }, 9000);
                            });

                            // Timeout para garantir que o ticket seja fechado mesmo se o npm demorar demais
                            setTimeout(() => {
                                if (!ticketChannel.deleted) {
                                    ticketChannel.delete();
                                }
                            }, 600000); // 10 minutos de espera máximo
                        } else {
                            ticketChannel.send(`${emoji.emoji1} | O arquivo \`package.json\` não foi encontrado. Certifique-se de incluí-lo no seu zip.`);
                            setTimeout(() => {
                            ticketChannel.delete();
                            }, 20000); // Reduzido o tempo para evitar problemas com tickets
                        }
                    } catch (err) {
                        console.error(err);
                        ticketChannel.send('Houve um erro ao extrair o arquivo. Certifique-se de que o arquivo está em um formato válido.');
                        ticketChannel.delete(); // Fechar ticket em caso de erro
                    }
                });
            });
        });

        collector.on('end', (collected) => {
            if (collected.size === 0) {
                fs.rmSync(userDir, { recursive: true, force: true }); // Remover pasta do usuário
                ticketChannel.delete();
            }
        });
    }).catch(err => {
        console.error(err);
        message.reply('Houve um erro ao criar seu ticket. Tente novamente mais tarde.');
    });
    });
}
break;
case `${config.prefix}plano`:
    {
        if (!isHostActive) {
        // Se o host estiver desativado, todos esses comandos não funcionarão
            return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }
            if (!apiFunctional && !apiFunctional2) {
        return message.reply(`${emoji.emoji1} | A API \`${apiName}\` está desativada. Não é possível hospedar bots com essa API.`);
    }
    UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }
            message.reply(`Plano atual: ${Object.keys(plans).find(key => plans[key] === plan)}\nRAM: ${plan.ramLimit} MB\nLimite de bots: ${plan.botLimit}`);
            });
    }
    break;
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userId = message.author.id;
    const member = message.guild.members.cache.get(userId);
    const plan = getUserPlan(member); // Obtem o plano do usuário
    const apiName = 'Free';
    const apiFunctional = apiStatusv1[apiName]; // Verifica se a API está funcional na versão v1
    const apiFunctional2 = apiStatus[apiName]; // Verifica se a API está funcional na versão atual
    const allowedChannelIds = config.allowedChannelIds; // Um array de IDs de canais permitidos

if (!allowedChannelIds.includes(message.channel.id)) {
    return;
}
    
    if (!plan) return message.reply('Você não possui permissão para hospedar bots.');
    
    const userDir = path.join(__dirname, 'src', 'bots', apiName, userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }

    const botFile = fs.readdirSync(userDir).find(file => file.endsWith('.js') || file.endsWith('.py'));

    switch (command) {
case `${config.prefix}commit`:
case `${config.prefix}c`: {
    if (!isHostActive) {
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }
        if (!apiFunctional && !apiFunctional2) {
        return message.reply(`${emoji.emoji1} | A API \`${apiName}\` está desativada. Não é possível hospedar bots com essa API.`);
    }
UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

    const userDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id);
    let botProcess = null; // Variável para armazenar o processo do bot

    const checkBotFilesExist = () => {
        const validFiles = ['main.js', 'index.js', 'main.py', 'main.json', 'index.json'];
        return validFiles.some(file => fs.existsSync(path.join(userDir, file)));
    };

    if (!checkBotFilesExist()) {
        return message.reply('Nenhuma aplicação existente encontrada. Use `.up` para enviar a aplicação inicial.');
    }

    if (!apiFunctional && !apiFunctional2) {
        return message.reply(`${emoji.emoji1} | A API \`${apiName}\` está desativada. Não é possível hospedar bots com essa API.`);
    }

    const existingChannel = message.guild.channels.cache.find(
        channel => channel.name === `ticket-${message.author.id}` && channel.type === Discord.ChannelType.GuildText
    );

    if (existingChannel) {
        return message.reply(`Você já possui um ticket aberto: ${existingChannel}. Continue por lá.`);
    }

    const category = message.guild.channels.cache.find(
        (channel) => channel.type === Discord.ChannelType.GuildCategory && channel.name.toLowerCase() === 'tickets'
    );

    // Criando o canal de ticket
    message.guild.channels.create({
        name: `ticket-${message.author.id}`,
        type: Discord.ChannelType.GuildText,
        permissionOverwrites: [
            {
                id: message.guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: message.author.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                ],
            },
        ],
    }).then((ticketChannel) => {
        const existingChannel = message.guild.channels.cache.find(
        channel => channel.name === `ticket-${message.author.id}` && channel.type === Discord.ChannelType.GuildText
    );
        message.reply(`Acessar seu canal <${existingChannel}>`);
        ticketChannel.send(`<@${message.author.id}>, este é o seu canal de ticket para atualizar a aplicação.`);

        const filter = (msg) => msg.author.id === message.author.id && msg.attachments.size > 0;
        const collector = ticketChannel.createMessageCollector({ filter, time: 60000 });

        ticketChannel.send('Envie o novo arquivo para atualizar sua aplicação. Todos os arquivos são aceitos (máximo 100MB).');

        collector.on('collect', async (msg) => {
            const attachment = msg.attachments.first();
            const fileName = attachment.name;
            const ext = path.extname(fileName).toLowerCase();
            const filePath = path.join(userDir, fileName);

            const fileSize = attachment.size / (1024 * 1024); // Tamanho em MB
            if (fileSize > 100) {
                return ticketChannel.send('O arquivo excede o tamanho máximo permitido de 100MB.');
            }

            const fileStream = fs.createWriteStream(filePath);

            https.get(attachment.url, (response) => {
                response.pipe(fileStream);
                fileStream.on('finish', async () => {
                    fileStream.close();

                    if (botProcess) {
                        botProcess.kill(); // Matar o processo existente
                        botProcess = null;
                    }

                    if (['.js', '.py', '.json', '.zip'].includes(ext)) {
                        if (ext === '.zip') {
                            try {
                                await extract(filePath, { dir: userDir });
                                fs.unlinkSync(filePath);
                                ticketChannel.send('Sua aplicação foi atualizada com sucesso (arquivo `.zip`).');
                            } catch (error) {
                                ticketChannel.send('Houve um erro ao tentar atualizar sua aplicação com o arquivo `.zip`.');
                                console.error(error);
                                return;
                            }
                        }

                        // Iniciar o novo processo
                        if (ext === '.js') {
                            botProcess = exec(`node ${filePath}`, (err, stdout, stderr) => {
                                if (err) {
                                    ticketChannel.send(`Erro ao colocar a aplicação online: ${stderr}`);
                                    console.error(`Erro: ${stderr}`);
                                } else {
                                    console.log(stdout);
                                }
                            });
                        } else if (ext === '.py') {
                            botProcess = exec(`python ${filePath}`, (err, stdout, stderr) => {
                                if (err) {
                                    ticketChannel.send(`Erro ao colocar a aplicação online: ${stderr}`);
                                    console.error(`Erro: ${stderr}`);
                                } else {
                                    console.log(stdout);
                                }
                            });
                        } else if (ext === '.json') {
                            ticketChannel.send('Arquivo `.json` atualizado, mas não é um arquivo executável.');
                        }
                        ticketChannel.send('Sua aplicação foi atualizada e está agora online!');
                    } else {
                        ticketChannel.send('Tipo de arquivo não suportado.');
                    }

                    setTimeout(() => {
                        ticketChannel.delete();
                    }, 5000); // Fechar o ticket após 5 segundos
                });
            });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time') {
                setTimeout(() => {
                    ticketChannel.delete();
                }, 5000); // Fechar o ticket após 5 segundos
            }
        });
    }).catch(err => {
        console.error(err);
        message.reply('Houve um erro ao criar o canal de ticket. Tente novamente mais tarde.');
    });
    });
}
break;
case `${config.prefix}b`:
case `${config.prefix}backup`: { // Fazer backup
    if (!isHostActive) {
        // Se o host estiver desativado, todos esses comandos não funcionarão
        return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }
        if (!apiFunctional && !apiFunctional2) {
        return message.reply(`${emoji.emoji1} | A API \`${apiName}\` está desativada. Não é possível hospedar bots com essa API.`);
    }
    UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

        const userDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id);

    // Função para verificar a existência de arquivos válidos na pasta do usuário
    const checkBotFilesExist = () => {
        const validFiles = ['main.js', 'index.js', 'main.py', 'index.py'];
        return validFiles.some(file => fs.existsSync(path.join(userDir, file)));
    };

    // Verifica se existem bots válidos hospedados
    if (!checkBotFilesExist()) {
        return message.reply('Nenhuma aplicação existente encontrada. Use `.up` para enviar a aplicação inicial.');
    }

    if (!apiFunctional && !apiFunctional2) {
        return message.reply(`${emoji.emoji1} | A API \`${apiName}\` está desativada. Não é possível hospedar bots com essa API.`);
    }

    const botBackupPath = path.join(__dirname, 'src', 'bots', apiName, `${message.author.id}.zip`); // Definindo o caminho correto para o arquivo ZIP
    const output = fs.createWriteStream(botBackupPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', async () => {
        try {
            // Enviar o arquivo ZIP para o privado do usuário
            await message.author.send({
                files: [botBackupPath],
            });
            fs.unlinkSync(botBackupPath); // Remove o arquivo após o envio
            message.reply('Backup gerado e enviado no privado.');
        } catch (err) {
            console.error('Erro ao enviar o backup:', err);
            message.reply('Erro ao enviar o backup. Certifique-se de que pode receber mensagens diretas.');
        }
    });

    output.on('error', (err) => {
        console.error('Erro ao criar o arquivo de backup:', err);
        message.reply('Erro ao gerar o backup. Tente novamente mais tarde.');
    });

    archive.on('error', (err) => {
        console.error('Erro ao arquivar os arquivos:', err);
        message.reply('Erro ao arquivar os dados. Tente novamente.');
    });

    // Corrigir caminho para o diretório do bot
    const botDir = path.join(__dirname, 'src', 'bots', apiName, message.author.id.toString());
    archive.pipe(output);
    archive.directory(botDir, false);  // Corrigido para garantir o diretório correto

    archive.finalize().catch((err) => {
        console.error('Erro ao finalizar o arquivo ZIP:', err);
        message.reply('Erro ao finalizar o backup. Tente novamente.');
    });
    });
}
break;
case `${config.prefix}logs`: {
    const userId = message.author.id;
    const userDir = path.join(__dirname, 'src', 'bots', apiName, userId);
    const userLogDir = path.join(userDir, 'logs');

    if (!apiFunctional && !apiFunctional2) {
        return message.reply(`${emoji.emoji1} | A API \`${apiName}\` está desativada. Não é possível hospedar bots com essa API.`);
    }

    UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }

        if (!fs.existsSync(userLogDir)) {
            return message.reply('❌ O diretório de logs não foi encontrado. Certifique-se de que o bot tenha gerado logs.');
        }

        const logFiles = fs.readdirSync(userLogDir)
            .filter(file => file.startsWith('bot_logs_') && file.endsWith('.txt'))
            .map(file => path.join(userLogDir, file));

        if (logFiles.length === 0) {
            return message.reply('❌ Nenhum log encontrado. Certifique-se de que o bot tenha gerado logs.');
        }

        const latestLogFile = logFiles.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime)[0];
        let logsPreview = 'Nenhum log disponível.';

        try {
            const logs = fs.readFileSync(latestLogFile, 'utf8').split('\n').slice(-15);
            if (logs.length > 0) {
                logsPreview = logs.join('\n');
            }
        } catch (err) {
            console.error('Erro ao ler o arquivo de logs:', err);
            return message.reply('❌ Não foi possível ler o arquivo de logs.');
        }

        const logEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📡 Logs da sua aplicação')
            .setDescription(`\`\`\`js\n${logsPreview}\n\`\`\``)
            .setFooter({ text: 'RedCloud' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('private_logs')
                    .setLabel('📩 Privado')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('public_logs')
                    .setLabel('👥 Servidor')
                    .setStyle(ButtonStyle.Success),
            );

        // Mensagem inicial com botões
        const selectionMessage = await message.reply({ content: 'Escolha como deseja visualizar os logs:', components: [row] });

        const filter = (interaction) => interaction.user.id === userId;
        const collector = selectionMessage.createMessageComponentCollector({ filter, time: 30000 });

        collector.on('collect', async (interaction) => {
            try {
                if (interaction.customId === 'private_logs') {
                    try {
                        await interaction.user.send({ embeds: [logEmbed] });
                        await interaction.reply({ content: '📩 Logs enviados para suas DMs!', ephemeral: true });
                    } catch (err) {
                        console.error('Erro ao enviar DM:', err);
                        await interaction.reply({ content: '❌ Não foi possível enviar as DMs. Certifique-se de que estão habilitadas.', ephemeral: true });
                    }
                } else if (interaction.customId === 'public_logs') {
                    const rowWithButtons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('delete_logs')
                                .setLabel('Apagar Logs')
                                .setStyle(ButtonStyle.Danger),
                        );

                    const logMessage = await interaction.channel.send({ embeds: [logEmbed], components: [rowWithButtons] });

                    const buttonCollector = logMessage.createMessageComponentCollector({ filter, time: 60000 });

                    buttonCollector.on('collect', async (buttonInteraction) => {
                        if (buttonInteraction.customId === 'delete_logs') {
                            fs.readdirSync(userLogDir).forEach(file => fs.unlinkSync(path.join(userLogDir, file)));
                            await buttonInteraction.reply({ content: '🗑️ Todos os logs foram apagados com sucesso!', ephemeral: true });
                            if (!logMessage.deleted) {
                                await logMessage.delete().catch(console.error);
                            }
                        }
                    });

                    buttonCollector.on('end', async () => {
                        if (!logMessage.deleted) {
                            await logMessage.edit({ components: [] }).catch(console.error);
                        }
                    });
                }

                // Desativa os botões da mensagem original
                if (!selectionMessage.deleted) {
                    await selectionMessage.edit({ components: [] }).catch(console.error);
                }
            } catch (err) {
                console.error('Erro na interação:', err);
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'time' && !selectionMessage.deleted) {
                try {
                    await selectionMessage.edit({ components: [] }).catch(console.error);
                } catch (err) {
                    console.error('Erro ao editar mensagem após expiração do tempo:', err);
                }
            }
        });
    });
}
break;
case `${config.prefix}apagar`:
case `${config.prefix}rb`: {
        if (!isHostActive) {
        // Se o host estiver desativado, todos esses comandos não funcionarão
            return message.reply(`${emoji.emoji1} | A hospedagem está desativada no momento. Não é possível executar comandos relacionados à hospedagem.`);
    }
        UserModel.findOne({ userId }, async (err, existingUser) => {
        if (err) {
            console.error("Erro ao verificar usuário:", err);
            return message.reply("❌ | Ocorreu um erro ao tentar verificar o usuário.");
        }

        if (!existingUser) {
            return message.reply('⚠️ | Você ainda não está vinculado à nossa hospedagem. Use o comando `.vincular` para se registrar.');
        }
        if (!apiFunctional && !apiFunctional2) {
        return message.reply(`${emoji.emoji1} | A API \`${apiName}\` está desativada. Não é possível hospedar bots com essa API.`);
    }
    
            const confirmMsg = await message.reply({
                content: 'Você tem certeza que deseja excluir sua aplicação? Esta ação não pode ser desfeita.',
                components: [
                    new Discord.ActionRowBuilder().addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('confirm_remove')
                            .setLabel('Sim, excluir')
                            .setStyle(Discord.ButtonStyle.Danger),
                        new Discord.ButtonBuilder()
                            .setCustomId('cancel_remove')
                            .setLabel('Cancelar')
                            .setStyle(Discord.ButtonStyle.Secondary)
                    ),
                ],
            });

            const filterv1 = (interaction) => interaction.user.id === userId && ['confirm_remove', 'cancel_remove'].includes(interaction.customId);
            const collectorv1 = confirmMsg.createMessageComponentCollector({ filterv1, time: 30000 });

            collectorv1.on('collect', async (interaction) => {
                if (interaction.customId === 'confirm_remove') {
                    fs.rmSync(userDir, { recursive: true, force: true });
                    delete userBots[userId];
                    await interaction.update({ content: 'Sua aplicação foi excluída com sucesso.', components: [] });
                } else {
                    await interaction.update({ content: 'A exclusão foi cancelada.', components: [] });
                }
            });

            collectorv1.on('end', (collected) => {
                if (collected.size === 0) confirmMsg.edit({ content: 'Tempo expirado. Nenhuma ação foi tomada.', components: [] });
            });
            });
            }
            break;
case `${config.prefix}rm`: {
    const hasAdminRole = message.member.roles.cache.some((role) =>
            config.adminRoles.includes(role.id)
        );

        if (!hasAdminRole) {
            return message.reply('❌ | Você não possui permissão para usar este comando!');
        }
  // Verifique se o autor do comando forneceu um ID
  const args = message.content.split(" ");
  if (args.length < 2) {
    message.reply("Por favor, forneça o ID do usuário para apagar a pasta.");
    break;
  }

  const userId = args[1]; // ID fornecido
  const folderPath = path.join(__dirname, "src", "bots", "Free", userId);

  // Verifica se a pasta existe
  if (!fs.existsSync(folderPath)) {
    message.reply(`A pasta para o ID ${userId} não foi encontrada.`);
    break;
  }

  try {
    // Remove a pasta e todo o seu conteúdo
    fs.rmSync(folderPath, { recursive: true, force: true });
    message.reply(`A pasta para o ID ${userId} foi apagada com sucesso.`);
  } catch (error) {
    console.error("Erro ao tentar apagar a pasta:", error);
    message.reply(`Ocorreu um erro ao apagar a pasta para o ID ${userId}.`);
  }
}
break;
    }
});

function checkApiStatus() {
    const apiName = 'Free'; // Nome fixo da API
    const localBotsPath = path.join(__dirname, 'src', 'bots', apiName); // Caminho fixo para bots

    // Verifica se o caminho da pasta de bots existe
    if (!fs.existsSync(localBotsPath)) {
        console.log(`O caminho ${localBotsPath} não existe.`);
        return {
            apiName,
            totalLocalBots: 0,
            botPing: 'N/A',
            statusBar: '🟥🟥🟥🟥🟥', // Emoji para offline
            isFunctional: false,
            message: 'A hospedagem está offline. Nenhum bot está funcional.'
        };
    }

    let totalLocalBots = 0;

    try {
        // Lê os arquivos na pasta da API e conta os diretórios (bots)
        const apiBotFiles = fs.readdirSync(localBotsPath);
        totalLocalBots = apiBotFiles.filter(file => fs.statSync(path.join(localBotsPath, file)).isDirectory()).length;
    } catch (error) {
        console.error('Erro ao acessar a pasta de bots:', error);
        return {
            apiName,
            totalLocalBots: 0,
            botPing: 'N/A',
            statusBar: '🟥🟥🟥🟥🟥', // Emoji para erro de leitura
            isFunctional: false,
            message: 'Erro ao acessar a pasta de bots. Verifique o diretório.'
        };
    }

    // Simulação de ping para bots (você pode substituir essa lógica com pings reais, se necessário)
    const botPing = totalLocalBots > 0 ? `${Math.floor(Math.random() * 600) + 10}ms` : 'N/A';

    // Verificação de status da API
    const isFunctional = totalLocalBots > 0;
    const statusBar = isFunctional ? '🟩🟩🟩🟩🟩' : '🟥🟥🟥🟥🟥'; // Ajusta o status com base no número de bots

    return {
        apiName,
        totalLocalBots,
        botPing,
        statusBar,
        isFunctional,
        message: isFunctional 
            ? `API funcional. Bots ativos: ${totalLocalBots}` 
            : 'A hospedagem está offline ou não há bots ativos.'
    };
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userId = message.author.id;

    // Comando para desativar a hospedagem
    if (message.content === `${config.prefix}desativarhost2`) {
        const hasAdminRole = message.member.roles.cache.some((role) =>
            config.adminRoles.includes(role.id)
        );

        if (!hasAdminRole) {
            return message.reply('❌ | Você não possui permissão para usar este comando!');
        }
        if (!isHostActive) {
            return message.reply('A hospedagem já está desativada.');
        }

        isHostActive = false; // Desativa o host

        // Desativa todos os bots do plano Free
        Object.keys(userBots).forEach(userId => {
            const userBot = userBots[userId];

            Object.values(userBot).forEach(bot => {
                if (bot.process) {
                    bot.process.kill(); // Para o processo do bot
                    bot.process = null;
                }
            });

            // Informar ao usuário que os bots estão offline
            const user = message.guild.members.cache.get(userId);
            if (user) {
                user.send('Todos os seus bots foram desativados e estão offline devido à desativação da hospedagem.');
            }
        });

        message.reply('A hospedagem foi desativada. Todos os bots estão offline. Comandos relacionados à hospedagem não funcionarão.');
    }
    
if (message.content === `${config.prefix}ping`) {
    const timeTaken = Date.now() - message.createdTimestamp; // Calcula o ping da API
    const botPing = client.ws.ping; // Ping do WebSocket do bot

    const embed = new EmbedBuilder()
        .setColor(0x0099ff) // Cor do embed
        .setAuthor({
            name: client.user.username,
            iconURL: client.user.displayAvatarURL(),
        })
        .setDescription(`**Bot:** ${botPing}ms\n**API:** ${timeTaken}ms`)
        .setFooter({
            text: 'RedCloud',
        });

    message.reply({ embeds: [embed] });
}

    // Comando para ativar a hospedagem
    if (message.content === `${config.prefix}ativarhost2`) {
        const hasAdminRole = message.member.roles.cache.some((role) =>
            config.adminRoles.includes(role.id)
        );

        if (!hasAdminRole) {
            return message.reply('❌ | Você não possui permissão para usar este comando!');
        }
        if (isHostActive) {
            return message.reply('A hospedagem já está ativada.');
        }

        isHostActive = true; // Ativa o host

        // Ativa todos os bots do plano Free
        Object.keys(userBots).forEach(userId => {
            const userBot = userBots[userId];

            Object.values(userBot).forEach(bot => {
                if (bot.mainFile) {
                    const { spawn } = require('child_process');
                    const botProcess = spawn('node', [path.join(userBot.dir, bot.mainFile)], {
                        cwd: path.join(userBot.dir),
                        stdio: 'inherit'
                    });

                    bot.process = botProcess;

                    botProcess.on('error', (err) => {
                        console.error(`Erro ao iniciar o bot: ${err.message}`);
                    });
                }
            });

            const user = message.guild.members.cache.get(userId);
            if (user) {
                user.send('Seus bots foram ativados e estão online novamente.');
            }
        });

        message.reply('A hospedagem foi ativada. Todos os bots estão online e os comandos estão funcionando novamente.');
    }
    
    if (message.content === `${config.prefix}status`) {
    const statusEmbed = getHostingStatusEmbed();
    message.channel.send({ embeds: [statusEmbed] });
}

    // Comando para verificar o status
    if (message.content === `${config.prefix}status2`) {
        const hasAdminRole = message.member.roles.cache.some((role) =>
            config.adminRoles.includes(role.id)
        );

        if (!hasAdminRole) {
            return message.reply('❌ | Você não possui permissão para usar este comando!');
        }

        const uptime = process.uptime();
        const formattedUptime = new Date(uptime * 1000).toISOString().substr(11, 8);
        const botPing = `${client.ws.ping}ms`;
        const hostStatus = isHostActive ? '🟢 Online' : '🔴 Offline';

        const apiStatus = checkApiStatus();

        const embed = new EmbedBuilder()
            .setTitle('Status do Bot')
            .setColor('#00FF00')
            .addFields(
                { name: 'Hospedagem:', value: `Status: ${hostStatus}`, inline: true },
                { name: 'Ping:', value: botPing, inline: true },
                { name: 'Tempo Online:', value: formattedUptime, inline: true },
                {
                    name: `API dos Bots ${apiStatus.apiName}:`,
                    value: `Status: ${apiStatus.statusBar}\nTotal Bots: ${apiStatus.totalLocalBots}\nPing da API: ${apiStatus.botPing}`,
                    inline: false,
                }
            );

        message.channel.send({ embeds: [embed] });
    }
    
    if (message.content === `${config.prefix}mongodb`) {
        const hasAdminRole = message.member.roles.cache.some((role) =>
            config.adminRoles.includes(role.id)
        );

        if (!hasAdminRole) {
            return message.reply('❌ | Você não possui permissão para usar este comando!');
        }
    try {
        // Verificando se a conexão com o MongoDB está aberta
        db.once("open", async () => {
            console.log("✅ | Conexão com o MongoDB bem-sucedida.");

            // Aqui, você pode adicionar lógica para verificar dispositivos online
            const devices = await getMongoDevices();

            // Se não houver dispositivos, enviar mensagem
            if (devices.length === 0) {
                message.reply("❌ | Nenhum dispositivo encontrado.");
                return;
            }

            // Enviar os dispositivos no formato
            const deviceStatus = devices.map(device => {
                const tempoOnline = device.online ? `Tempo online: ${device.timeOnline}` : "Offline";
                return `${device.name}: ${tempoOnline}`;
            }).join("\n");

            message.reply(`Dispositivos conectados:\n${deviceStatus}`);
        });

    } catch (error) {
        console.error("Erro ao processar o comando mongodb:", error);
        message.reply("❌ | Ocorreu um erro ao tentar acessar o MongoDB.");
    }
}
});

client.once('ready', () => {
    console.log(`🛡️ | Bot conectado como ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: 'RedCloud.app - Gratuito', type: ActivityType.Watching }],
        status: 'online',
    });
   
    checkAndRestartBots(); // Verificar e reiniciar bots, se necessário
    startPeriodicCleanup(); // Limpeza periódica de bots

    /*console.log('Verificando se o Python está instalado...');
    const checkPython = exec('python3 --version');

    checkPython.on('close', (code) => {
        if (code === 0) {
            console.log('Python já está instalado.');
            installPip();
        } else {
            console.log('Python não encontrado. Iniciando instalação...');
            installPython();
        }
    });
    */
});
/*
function installPython() {
    const installPythonCommand = 'apt-get update && apt-get install -y python3';
    const pythonInstall = exec(installPythonCommand);

    pythonInstall.stdout.on('data', (data) => {
    });

    pythonInstall.stderr.on('data', (data) => {
        console.error(`[Erro Instalação Python]: ${data.trim()}`);
    });

    pythonInstall.on('close', (code) => {
        if (code === 0) {
            console.log('Python instalado com sucesso.');
            installPip();
        } else {
            console.error('Erro ao instalar o Python. Verifique se você tem permissões administrativas.');
        }
    });
}

function installPip() {
    const pipScriptUrl = 'https://bootstrap.pypa.io/get-pip.py';
    const pipScriptPath = path.join(__dirname, 'get-pip.py');

    console.log('Baixando o script get-pip.py...');
    const downloadScript = exec(`curl -o ${pipScriptPath} ${pipScriptUrl}`);

    downloadScript.on('close', (code) => {
        if (code !== 0) {
            console.error(`Erro ao baixar o script get-pip.py. Código de saída: ${code}`);
            return;
        }

        console.log('Instalando o pip...');
        const installPip = exec(`python3 ${pipScriptPath}`);

        installPip.stdout.on('data', (data) => {
        });

        installPip.stderr.on('data', (data) => {
            console.error(`[Erro Pip]: ${data.trim()}`);
        });

        installPip.on('close', (installCode) => {
            if (installCode === 0) {
                console.log('Pip instalado com sucesso.');
            } else {
                console.error(`Erro ao instalar o pip. Código de saída: ${installCode}`);
            }

            // Limpar o script baixado
            fs.unlinkSync(pipScriptPath);
        });
    });
}*/

setInterval(() => {
    updateBotCount();
}, 10000); // A cada 10 segundos

setInterval(() => {
    updateUserCount();
}, 10000); // A cada 10 segundos

// Função para verificar e reiniciar o bot se necessário
function checkAndRestartBots() {

    if (!isHostActive) {
        return;
    }
    
    const botsPath = path.join(__dirname, 'src', 'bots', 'Free');
    if (fs.existsSync(botsPath)) {
        const userFolders = fs.readdirSync(botsPath);
        userFolders.forEach((userId) => {
            const userBotPath = path.join(botsPath, userId);
            const botFilePaths = ['index.js', 'index.py', 'main.py', 'main.js'].map(file => path.join(userBotPath, file));

            // Verificar se algum dos arquivos do bot existe
            const botFilePath = botFilePaths.find(filePath => fs.existsSync(filePath));
            if (botFilePath) {
                // Verificar se o bot está rodando
                if (!userBots[userId]?.main?.process) {
                    // Se o bot não estiver rodando, reiniciá-lo
                    startBotProcess(userId, botFilePath);
                }
            }
        });
    }
}

// Função para iniciar o processo do bot
function startBotProcess(userId, botFilePath) {
    const userBotPath = path.join(__dirname, 'src', 'bots', 'Free', userId);
    
    if (!isHostActive) {
        return;
    }

    // Determinar o tipo de arquivo e o comando adequado
    const isPython = botFilePath.endsWith('.py');
    const command = isPython ? 'python3' : 'node';

    const botProcess = spawn(command, [botFilePath], { cwd: userBotPath, detached: true });

    // Criar diretório de logs, caso não exista
    const userLogDir = path.join(userBotPath, 'logs');
    if (!fs.existsSync(userLogDir)) {
        fs.mkdirSync(userLogDir, { recursive: true });
    }

    // Caminho para o arquivo de log exclusivo
    const userLogFilePath = path.join(userLogDir, `bot_logs_${Date.now()}.txt`);

    // Salvar processo no objeto userBots
    userBots[userId] = {
        main: { process: botProcess, logFilePath: userLogFilePath },
    };

    // Função para salvar logs
    const saveLogs = (data, type) => {
        const logMessage = `[${new Date().toISOString()}] [${type}] ${data.toString().trim()}`;
        fs.appendFile(userLogFilePath, `${logMessage}\n`, (err) => {
            if (err) console.error('Erro ao salvar log:', err);
        });
    };

    // Ouvintes para capturar logs
    botProcess.stdout.on('data', (data) => saveLogs(data, 'STDOUT'));
    botProcess.stderr.on('data', (data) => saveLogs(data, 'STDERR'));

    // Garantir que o processo seja limpo ao encerrar
    botProcess.on('close', (code) => {
        delete userBots[userId]; // Limpar o bot do usuário do objeto
    });

}

// Função para contar o número de usuários
async function updateUserCount() {
    const usersPath = path.join(__dirname, 'src', 'bots', 'Free');
    let userCount = 0;

    if (fs.existsSync(usersPath)) {
        const userFolders = fs.readdirSync(usersPath);
        userCount = userFolders.length;
    }

    // Atualizar o nome do canal de voz com o número de usuários
    const userVoiceChannel = await client.channels.fetch(config.userChannelId);
    if (userVoiceChannel) {
        userVoiceChannel.setName(`Users: ${userCount}`);
    }
}

// Função para contar o total de bots
async function updateBotCount() {
    const botsPath = path.join(__dirname, 'src', 'bots', 'Free');
    let botCount = 0;

    if (fs.existsSync(botsPath)) {
        const userFolders = fs.readdirSync(botsPath);
        for (const userFolder of userFolders) {
            const userBotPath = path.join(botsPath, userFolder);
            if (fs.existsSync(userBotPath)) {
                // Verifica se há pelo menos um arquivo .js ou .py na pasta do usuário
                const botFiles = fs.readdirSync(userBotPath);
                const hasValidBot = botFiles.some(file => file.endsWith('.js') || file.endsWith('.py'));

                if (hasValidBot) {
                    botCount += 1; // Incrementa a contagem de bots apenas se há um arquivo válido
                }
            }
        }
    }

    // Atualizar o nome do canal de voz com o número de bots
    const botVoiceChannel = await client.channels.fetch(config.botChannelId);
    if (botVoiceChannel) {
        botVoiceChannel.setName(`Total de Bots: ${botCount}`);
    }
}

// Função para limpeza periódica de bots
function startPeriodicCleanup() {
    const apiStatus = { Free: true }; // Simulação de status da API
    const runCleanup = () => {
        if (apiStatus.Free) {
            cleanEmptyUserBotFolders();
        } else {
        }
    };

    runCleanup();
    setInterval(runCleanup, 20000000); // Intervalo de 2000000ms (cerca de 33 minutos)
}

// Função para limpar pastas de bots vazias
function cleanEmptyUserBotFolders() {
    const apiPath = path.join(__dirname, 'src', 'bots', 'Free');
    if (fs.existsSync(apiPath)) {
        const userFolders = fs.readdirSync(apiPath).filter((file) => {
            const fullPath = path.join(apiPath, file);
            return fs.statSync(fullPath).isDirectory();
        });

        userFolders.forEach((userId) => {
            const userBotPath = path.join(apiPath, userId);
            if (fs.existsSync(userBotPath)) {
                const botFiles = fs.readdirSync(userBotPath).filter((file) =>
                    ['main.js', 'index.js', 'main.py', 'index.py'].includes(file)
                );

                if (botFiles.length === 0) {
                    fs.rmdirSync(userBotPath, { recursive: true });
                }
            }
        });
    }
}

// STATUS BOTS
const nodeStatus = {
    // Brasil (BRA)
    "BRA-SP - São Paulo - Intel - Brazil - Premium": false,   // BRA-SP - Premium
    "BRA-RJ - Rio de Janeiro - Intel - Brazil - Premium": false,  // BRA-RJ - Premium
    "BRA-PB - João Pessoa - Intel - Brazil - Free": true, // BRA-PB - Free
    
    // Estados Unidos (EUA)
    "EUA-RO - Dallas - Intel - United States - Premium": false,   // EUA-RO - Premium
    "EUA-CA - Los Angeles - Intel - United States - Premium": false,   // EUA-CA - Premium
    "EUA-NY - New York - Intel - United States - Premium": false,   // EUA-NY - Premium
    "EUA-IL - Chicago - Intel - United States - Free": true,   // EUA-IL - Free
    "EUA-TX - Dallas - Intel - United States - Free": true,   // EUA-TX - Free
    "EUA-CA - Los Angeles - Intel - United States - Free": true,   // EUA-CA - Free
};

// Função para obter o embed de status da hospedagem
function getHostingStatusEmbed() {
    const botsPath = path.join(__dirname, 'src', 'bots', 'Free');
    let totalBots = 0;
    let activeBots = 0;

    if (fs.existsSync(botsPath)) {
        const userFolders = fs.readdirSync(botsPath);

        userFolders.forEach((userId) => {
            const userBotPath = path.join(botsPath, userId);
            const botFilePaths = ['index.js', 'index.py', 'main.py', 'main.js'].map((file) =>
                path.join(userBotPath, file)
            );

            const botFilePath = botFilePaths.find((filePath) => fs.existsSync(filePath));
            if (botFilePath) {
                totalBots++;
                if (userBots[userId]?.main?.process) {
                    activeBots++;
                }
            }
        });
    }

    // Gera a barra de status baseada nos bots online e offline
    const statusBar = generateStatusBar(totalBots, activeBots);

    // Gera a descrição do status dos nodes
    let nodeStatusText = '';
    Object.keys(nodeStatus).forEach(node => {
        nodeStatusText += `${node}: ${nodeStatus[node] ? "🟢 Online" : "🔴 Offline"}\n`;
    });

    // Gera a descrição do painel
    const panelStatus = isPanelActive ? "🟢 Online" : "🔴 Offline";
    const embed = {
        title: 'RedCloud - Status de Hospedagem',
        description: `
        **Nodes Stats [Total: 8]**
        ${nodeStatusText}

        **Panel Stats**
        - Panel: ${panelStatus}
        - Users: ${totalBots}
        - Bots: ${activeBots}
        `,
        color: activeBots === totalBots ? 0x00ff00 : activeBots > 0 ? 0x0000ff : 0xff0000,
    };

    return embed;
}

// Função para gerar a barra de status
function generateStatusBar(totalBots, activeBots) {
    const totalBars = 10; // Número fixo de barras na barra de progresso
    const activeBars = Math.round((activeBots / totalBots) * totalBars) || 0; // Calcula a proporção de barras ativas
    const inactiveBars = totalBars - activeBars;

    return '🟩'.repeat(activeBars) + '🟥'.repeat(inactiveBars); // Retorna as barras em verde e vermelho
}

require('./monitoring')
require('./MongoDB')

// Login do bot
client.login(config.token);