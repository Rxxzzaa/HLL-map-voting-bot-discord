/**
 * Frontline Democracy - Slash Command Registration
 * Registers all slash commands with Discord
 */

const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

const commands = [
    new SlashCommandBuilder()
        .setName('mapvote')
        .setDescription('Frontline Democracy - HLL map voting commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Open the setup wizard (Server Owner/Admin only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Show the map voting control panel')
                .addIntegerOption(option =>
                    option
                        .setName('server')
                        .setDescription('Server number (1-4)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Server 1', value: 1 },
                            { name: 'Server 2', value: 2 },
                            { name: 'Server 3', value: 3 },
                            { name: 'Server 4', value: 4 }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start map voting')
                .addIntegerOption(option =>
                    option
                        .setName('server')
                        .setDescription('Server number (1-4)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Server 1', value: 1 },
                            { name: 'Server 2', value: 2 },
                            { name: 'Server 3', value: 3 },
                            { name: 'Server 4', value: 4 }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop map voting')
                .addIntegerOption(option =>
                    option
                        .setName('server')
                        .setDescription('Server number (1-4)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Server 1', value: 1 },
                            { name: 'Server 2', value: 2 },
                            { name: 'Server 3', value: 3 },
                            { name: 'Server 4', value: 4 }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show map voting status')
                .addIntegerOption(option =>
                    option
                        .setName('server')
                        .setDescription('Server number (1-4)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Server 1', value: 1 },
                            { name: 'Server 2', value: 2 },
                            { name: 'Server 3', value: 3 },
                            { name: 'Server 4', value: 4 }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Show help information')
        )
        .toJSON()
];

async function registerCommands(client) {
    const token = process.env.DISCORD_TOKEN;

    if (!token || !client.user) {
        logger.error('Cannot register commands: missing token or client not ready');
        return false;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        logger.info('Registering slash commands...');

        // Register globally (takes up to 1 hour to propagate)
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        logger.info('Slash commands registered successfully');
        return true;
    } catch (error) {
        logger.error('Error registering slash commands:', error);
        return false;
    }
}

module.exports = { registerCommands, commands };
