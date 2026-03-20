/**
 * Frontline Democracy
 * Discord bot for Hell Let Loose map voting
 * With Discord-based setup wizard for easy deployment
 */

require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const logger = require('./utils/logger');
const { CRCONService } = require('./services/crcon');
const { MapVotingService } = require('./services/mapVoting');
const { MapVotePanelService } = require('./services/mapVotePanel');
const { SeedingPanelService } = require('./services/seedingPanel');
const { SeedingDraftStore } = require('./services/seedingDraftStore');
const configManager = require('./services/configManager');
const setupWizard = require('./services/setupWizard');
const scheduleManager = require('./services/scheduleManager');
const schedulePanel = require('./services/schedulePanel');
const { registerCommands } = require('./commands/register');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessagePolls,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel]
});

// Service instances
const mapVotingServices = {};
const crconServices = {};
const mapVotePanelService = new MapVotePanelService();
const seedingPanelService = new SeedingPanelService();
const seedingDraftStore = new SeedingDraftStore();

// Initialize servers from config
async function initializeServers() {
    // Stop and clear existing services
    for (const key of Object.keys(mapVotingServices)) {
        if (mapVotingServices[key] && mapVotingServices[key].stop) {
            mapVotingServices[key].stop();
        }
        delete mapVotingServices[key];
    }
    for (const key of Object.keys(crconServices)) {
        delete crconServices[key];
    }

    // Load servers from configManager (merges saved config with .env)
    for (let serverNum = 1; serverNum <= 4; serverNum++) {
        const config = configManager.getEffectiveServerConfig(serverNum);

        if (config.configured && config.channelId) {
            // Create CRCON service
            const crcon = new CRCONService(config.crconUrl, config.crconToken, config.serverName);
            crconServices[serverNum] = crcon;

            // Create map voting service
            const service = new MapVotingService(serverNum);
            if (typeof config.excludePlayedMapForXvotes === 'number') {
                service.setConfig('excludeRecentMaps', config.excludePlayedMapForXvotes);
            }
            const success = await service.initialize(client, config.channelId, crcon);

            if (success) {
                mapVotingServices[serverNum] = service;
                logger.info(`${config.serverName} Map Voting initialized`);
            } else {
                logger.error(`${config.serverName} Map Voting failed to initialize`);
            }
        } else {
            logger.info(`Server ${serverNum} not configured, skipping`);
        }
    }
}

// Check if user has admin permissions
function isAdmin(member) {
    if (!member) return false;

    // Server owner always has access
    if (member.guild.ownerId === member.id) return true;

    // Check for Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    // Check for configured admin role
    const adminRoleId = configManager.getAdminRoleId();
    if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;

    return false;
}

// Check if user is server owner (for setup command)
function isServerOwner(member) {
    if (!member) return false;
    return member.guild.ownerId === member.id ||
           member.permissions.has(PermissionFlagsBits.Administrator);
}

async function updatePanelMessage(interaction, payload, options = {}) {
    const { preferMessageEdit = false } = options;

    if (!preferMessageEdit && (interaction.deferred || interaction.replied)) {
        try {
            await interaction.editReply(payload);
            return;
        } catch (error) {
            logger.warn('Failed to edit interaction reply, falling back to message edit.', error);
        }
    }

    if (interaction.message) {
        await interaction.message.edit(payload);
        return;
    }

    throw new Error('Unable to update interaction panel message.');
}

async function buildSeedPanelForUser(crconService, serverName, serverNum, guildId, userId) {
    const session = await seedingDraftStore.getOrCreate(crconService, guildId, userId, serverNum);
    const summary = seedingDraftStore.getSummary(session);
    const panel = await seedingPanelService.buildMainPanel(crconService, serverName, serverNum, session, summary);
    return { panel, session, summary };
}

function parseBoundedInt(raw, fieldName, min, max) {
    const parsed = parseInt(String(raw).trim(), 10);
    if (Number.isNaN(parsed)) {
        throw new Error(`${fieldName} must be a number`);
    }
    if (parsed < min || parsed > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return parsed;
}

function parseBooleanStrict(raw, fieldName) {
    const val = String(raw).trim().toLowerCase();
    if (val === 'true') return true;
    if (val === 'false') return false;
    throw new Error(`${fieldName} must be true or false`);
}

// Ready event
client.once(Events.ClientReady, async () => {
    logger.info(`Frontline Democracy logged in as ${client.user.tag}`);

    // Register slash commands
    await registerCommands(client);

    // Initialize servers
    await initializeServers();

    const serverCount = Object.keys(mapVotingServices).length;
    if (serverCount === 0) {
        logger.info('No servers configured. Use /mapvote setup to configure.');
    } else {
        logger.info(`Frontline Democracy ready with ${serverCount} server(s)!`);
    }
});

// Poll vote events
client.on(Events.MessagePollVoteAdd, async (pollAnswer, userId) => {
    for (const [serverNum, service] of Object.entries(mapVotingServices)) {
        await service.onPollVoteAdd(pollAnswer, userId);
    }
});

client.on(Events.MessagePollVoteRemove, async (pollAnswer, userId) => {
    for (const [serverNum, service] of Object.entries(mapVotingServices)) {
        await service.onPollVoteRemove(pollAnswer, userId);
    }
});

// Interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        // ========== SLASH COMMANDS ==========
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName !== 'mapvote' && interaction.commandName !== 'seed') return;

            const commandName = interaction.commandName;
            const subcommand = interaction.options.getSubcommand();
            const serverNum = interaction.options.getInteger('server') || 1;

            // Map vote setup command - Server Owner only
            if (commandName === 'mapvote' && subcommand === 'setup') {
                if (!isServerOwner(interaction.member)) {
                    return interaction.reply({
                        content: 'Only the server owner or administrators can use the setup wizard.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                const panel = setupWizard.buildSetupPanel();
                await interaction.reply(panel);
                return;
            }

            // All other command actions require admin role
            if (!isAdmin(interaction.member)) {
                const adminRoleId = configManager.getAdminRoleId();
                const roleMsg = adminRoleId
                    ? `You need the <@&${adminRoleId}> role to use this command.`
                    : 'No admin role is configured. Ask the server owner to set one up with `/mapvote setup`.';
                return interaction.reply({
                    content: roleMsg,
                    flags: MessageFlags.Ephemeral
                });
            }

            const service = mapVotingServices[serverNum];
            const crcon = crconServices[serverNum];
            const config = configManager.getEffectiveServerConfig(serverNum);
            const serverName = config.serverName || `Server ${serverNum}`;

            if (commandName === 'seed' && subcommand === 'panel') {
                if (!crcon) {
                    return interaction.reply({
                        content: `${serverName} is not configured. Use \`/mapvote setup\` to configure CRCON first.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                await interaction.deferReply();
                const { panel } = await buildSeedPanelForUser(
                    crcon,
                    serverName,
                    serverNum,
                    interaction.guildId,
                    interaction.user.id
                );
                await interaction.editReply(panel);
            }

            else if (commandName === 'seed' && subcommand === 'status') {
                if (!crcon) {
                    return interaction.reply({
                        content: `${serverName} is not configured. Use \`/mapvote setup\` to configure CRCON first.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const [seedingRaw, seedVipRaw] = await Promise.all([
                    crcon.getSeedingRulesConfig().catch(() => null),
                    crcon.getSeedVipConfig().catch(() => null)
                ]);

                const seeding = seedingRaw?.result || {};
                const seedVip = seedVipRaw?.result || {};
                const draft = await seedingDraftStore.getOrCreate(
                    crcon,
                    interaction.guildId,
                    interaction.user.id,
                    serverNum
                );
                const summary = seedingDraftStore.getSummary(draft);

                await interaction.reply({
                    content: `**${serverName} Seeding Status**\n` +
                        `Seeding Rules: ${seeding.enabled ? 'ON' : 'OFF'} (dry_run=${!!seeding.dry_run})\n` +
                        `Seed VIP: ${seedVip.enabled ? 'ON' : 'OFF'} (dry_run=${!!seedVip.dry_run})\n` +
                        `Warning/Punish: ${seeding.number_of_warnings ?? 0}/${seeding.number_of_punishments ?? 0}\n` +
                        `Thresholds: ${(seedVip.player_announce_thresholds || []).join(', ') || 'none'}\n` +
                        `Draft: ${(summary.hasSeedingChanges || summary.hasSeedVipChanges) ? 'UNSAVED CHANGES' : 'In sync'}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            else if (subcommand === 'panel') {
                if (!service) {
                    return interaction.reply({
                        content: `${serverName} is not configured. Use \`/mapvote setup\` to configure.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                await interaction.deferReply();
                const panel = await mapVotePanelService.buildControlPanel(service, crcon, serverName);
                await interaction.editReply(panel);
            }

            else if (subcommand === 'start') {
                if (!service) {
                    return interaction.reply({ content: `${serverName} is not configured`, flags: MessageFlags.Ephemeral });
                }
                const result = await service.resume(interaction.user.username);
                await interaction.reply({
                    content: result ? `Map voting started for ${serverName}` : `Map voting already running for ${serverName}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            else if (subcommand === 'stop') {
                if (!service) {
                    return interaction.reply({ content: `${serverName} is not configured`, flags: MessageFlags.Ephemeral });
                }
                const result = await service.pause(interaction.user.username);
                await interaction.reply({
                    content: result ? `Map voting paused for ${serverName}` : `Map voting already paused for ${serverName}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            else if (subcommand === 'status') {
                if (!service) {
                    return interaction.reply({ content: `${serverName} is not configured`, flags: MessageFlags.Ephemeral });
                }
                const serviceConfig = service.getConfig();
                await interaction.reply({
                    content: `**${serverName} Status:**\n` +
                        `Status: ${service.getStatus()}\n` +
                        `Vote Active: ${serviceConfig.voteActive}\n` +
                        `Seeded: ${serviceConfig.seeded}\n` +
                        `Min Players: ${serviceConfig.minimumPlayers}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            else if (subcommand === 'help') {
                await interaction.reply({
                    content: '**Frontline Democracy Commands:**\n' +
                        '`/mapvote setup` - Open setup wizard (Owner/Admin only)\n' +
                        '`/mapvote panel [server]` - Show control panel\n' +
                        '`/mapvote start [server]` - Start map voting\n' +
                        '`/mapvote stop [server]` - Stop map voting\n' +
                        '`/mapvote status [server]` - Show status\n' +
                        '`/mapvote help` - Show this help\n' +
                        '`/seed panel [server]` - Seeding draft panel\n' +
                        '`/seed status [server]` - Seeding status summary\n\n' +
                        '*[server] = 1, 2, 3, or 4 (default: 1)*',
                    flags: MessageFlags.Ephemeral
                });
            }

            return;
        }

        // ========== BUTTON INTERACTIONS ==========
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // ========== SETUP WIZARD BUTTONS ==========
            if (customId.startsWith('setup_')) {
                // Setup requires server owner
                if (!isServerOwner(interaction.member)) {
                    return interaction.reply({
                        content: 'Only the server owner or administrators can modify setup.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (customId === 'setup_add_server') {
                    const nextNum = setupWizard.getNextServerNumber();
                    if (!nextNum) {
                        return interaction.reply({
                            content: 'Maximum of 4 servers reached. Remove a server first.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    const modal = setupWizard.buildServerModal();
                    await interaction.showModal(modal);
                }

                else if (customId === 'setup_edit_server') {
                    const panel = setupWizard.buildServerSelectMenu('edit');
                    if (!panel) {
                        return interaction.reply({ content: 'No servers configured.', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.update(panel);
                }

                else if (customId === 'setup_remove_server') {
                    const panel = setupWizard.buildServerSelectMenu('remove');
                    if (!panel) {
                        return interaction.reply({ content: 'No servers configured.', flags: MessageFlags.Ephemeral });
                    }
                    await interaction.update(panel);
                }

                else if (customId === 'setup_set_admin_role') {
                    // Fetch guild roles
                    await interaction.guild.roles.fetch();
                    const panel = setupWizard.buildAdminRolePanel(interaction.guild.roles.cache);
                    await interaction.update(panel);
                }

                else if (customId === 'setup_clear_admin_role') {
                    setupWizard.clearAdminRole();
                    await interaction.update(setupWizard.buildSetupPanel());
                    await interaction.followUp({
                        content: 'Admin role cleared. Only the server owner can now use bot commands.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                else if (customId === 'setup_test_connection') {
                    await interaction.deferUpdate();
                    const results = await setupWizard.testAllConnections();
                    const panel = setupWizard.buildTestResultsEmbed(results);
                    await interaction.message.edit(panel);
                }

                else if (customId === 'setup_refresh' || customId === 'setup_back') {
                    await interaction.update(setupWizard.buildSetupPanel());
                }

                else if (customId === 'setup_apply_restart') {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    await initializeServers();
                    const serverCount = Object.keys(mapVotingServices).length;
                    await interaction.editReply({
                        content: `Configuration applied! ${serverCount} server(s) initialized.\n\nYou can now use \`/mapvote panel\` to control map voting.`
                    });
                    await interaction.message.edit(setupWizard.buildSetupPanel());
                }

                return;
            }

            // ========== MAP VOTING BUTTONS ==========
            // Check admin permissions for map voting controls
            if (!isAdmin(interaction.member)) {
                return interaction.reply({
                    content: 'You do not have permission to use these controls.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Determine which server this is for (default to 1)
            let serverNum = 1;
            if (customId.includes('_s2') || customId.endsWith('_2')) serverNum = 2;
            if (customId.includes('_s3') || customId.endsWith('_3')) serverNum = 3;
            if (customId.includes('_s4') || customId.endsWith('_4')) serverNum = 4;

            const service = mapVotingServices[serverNum];
            const crcon = crconServices[serverNum];
            const config = configManager.getEffectiveServerConfig(serverNum);
            const serverName = config.serverName || `Server ${serverNum}`;

            // ========== SEEDING PANEL BUTTONS ==========
            if (customId.startsWith('seed_')) {
                if (!crcon) {
                    return interaction.reply({ content: 'CRCON service not available for this server.', flags: MessageFlags.Ephemeral });
                }

                const guildId = interaction.guildId;
                const userId = interaction.user.id;

                if (customId.startsWith('seed_form_seeding_enforcement_')) {
                    const { session } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    const modal = seedingPanelService.buildSeedingEnforcementModal(serverNum, session.seedingDraft);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_form_seeding_caps_')) {
                    const { session } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    const modal = seedingPanelService.buildSeedingCapsModal(serverNum, session.seedingDraft);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_form_seedvip_poll_')) {
                    const { session } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    const modal = seedingPanelService.buildSeedVipPollModal(serverNum, session.seedVipDraft);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_form_seedvip_requirements_')) {
                    const { session } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    const modal = seedingPanelService.buildSeedVipRequirementsModal(serverNum, session.seedVipDraft);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_form_seeding_messages_')) {
                    const { session } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    const modal = seedingPanelService.buildSeedingMessagesModal(serverNum, session.seedingDraft);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_form_seedvip_messages_')) {
                    const { session } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    const modal = seedingPanelService.buildSeedVipMessagesModal(serverNum, session.seedVipDraft);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_refresh_')) {
                    await interaction.deferUpdate();
                    await seedingDraftStore.refreshSession(crcon, guildId, userId, serverNum);
                    const { panel } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    await updatePanelMessage(interaction, panel);
                    return;
                }

                if (customId.startsWith('seed_toggle_seeding_')) {
                    await interaction.deferUpdate();
                    try {
                        const newEnabled = await crcon.toggleSeedingRulesEnabled();
                        await seedingDraftStore.refreshSession(crcon, guildId, userId, serverNum);
                        const { panel } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                        await updatePanelMessage(interaction, panel);
                        await interaction.followUp({
                            content: `Seeding rules ${newEnabled ? 'enabled' : 'disabled'} for ${serverName}.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } catch (e) {
                        logger.error(`Failed to toggle seeding rules for ${serverName}:`, e);
                        await interaction.followUp({
                            content: `Failed to toggle seeding rules: ${e.message}`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    return;
                }

                if (customId.startsWith('seed_toggle_vip_')) {
                    await interaction.deferUpdate();
                    try {
                        const newEnabled = await crcon.toggleSeedVipEnabled();
                        await seedingDraftStore.refreshSession(crcon, guildId, userId, serverNum);
                        const { panel } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                        await updatePanelMessage(interaction, panel);
                        await interaction.followUp({
                            content: `Seed VIP ${newEnabled ? 'enabled' : 'disabled'} for ${serverName}.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } catch (e) {
                        logger.error(`Failed to toggle Seed VIP for ${serverName}:`, e);
                        await interaction.followUp({
                            content: `Failed to toggle Seed VIP: ${e.message}`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    return;
                }

                if (customId.startsWith('seed_edit_seeding_json_')) {
                    const modal = seedingPanelService.buildPatchModal('seeding', serverNum);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_edit_seedvip_json_')) {
                    const modal = seedingPanelService.buildPatchModal('seedvip', serverNum);
                    await interaction.showModal(modal);
                    return;
                }

                if (customId.startsWith('seed_validate_')) {
                    await interaction.deferUpdate();
                    try {
                        const session = await seedingDraftStore.getOrCreate(crcon, guildId, userId, serverNum);
                        const summary = seedingDraftStore.getSummary(session);
                        if (!summary.hasSeedingChanges && !summary.hasSeedVipChanges) {
                            await interaction.followUp({
                                content: 'No draft changes to validate.',
                                flags: MessageFlags.Ephemeral
                            });
                        } else {
                            await seedingDraftStore.validate(crcon, session);
                            await interaction.followUp({
                                content: 'Draft validation passed for current changes.',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } catch (e) {
                        logger.error(`Draft validation failed for ${serverName}:`, e);
                        await interaction.followUp({
                            content: `Draft validation failed: ${e.message}`,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const { panel } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    await updatePanelMessage(interaction, panel);
                    return;
                }

                if (customId.startsWith('seed_apply_')) {
                    await interaction.deferUpdate();
                    try {
                        const session = await seedingDraftStore.getOrCreate(crcon, guildId, userId, serverNum);
                        const result = await seedingDraftStore.apply(crcon, session);

                        if (!result.changed) {
                            await interaction.followUp({
                                content: 'No draft changes to apply.',
                                flags: MessageFlags.Ephemeral
                            });
                        } else {
                            await seedingDraftStore.refreshSession(crcon, guildId, userId, serverNum);
                            await interaction.followUp({
                                content: 'Draft validated and applied to CRCON successfully.',
                                flags: MessageFlags.Ephemeral
                            });
                        }
                    } catch (e) {
                        logger.error(`Failed to apply draft for ${serverName}:`, e);
                        await interaction.followUp({
                            content: `Apply failed: ${e.message}`,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const { panel } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    await updatePanelMessage(interaction, panel);
                    return;
                }

                if (customId.startsWith('seed_discard_')) {
                    await interaction.deferUpdate();
                    try {
                        await seedingDraftStore.getOrCreate(crcon, guildId, userId, serverNum);
                        seedingDraftStore.discard(guildId, userId, serverNum);
                        await interaction.followUp({
                            content: 'Draft discarded. Live config restored in panel.',
                            flags: MessageFlags.Ephemeral
                        });
                    } catch (e) {
                        logger.error(`Failed to discard draft for ${serverName}:`, e);
                        await interaction.followUp({
                            content: `Discard failed: ${e.message}`,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const { panel } = await buildSeedPanelForUser(crcon, serverName, serverNum, guildId, userId);
                    await updatePanelMessage(interaction, panel);
                    return;
                }
            }

            if (!service) {
                return interaction.reply({ content: 'Map voting service not available for this server.', flags: MessageFlags.Ephemeral });
            }

            // Toggle map voting
            if (customId === 'mapvote_toggle' || customId.startsWith('mapvote_toggle_')) {
                await interaction.deferUpdate();

                let responseMessage = '';
                if (service.getStatus() === 'running') {
                    await service.pause(interaction.user.username);
                    responseMessage = `Map voting paused for ${serverName}`;
                } else {
                    await service.resume(interaction.user.username);
                    responseMessage = `Map voting started for ${serverName}`;
                }

                const panel = await mapVotePanelService.buildControlPanel(service, crcon, serverName);
                await updatePanelMessage(interaction, panel);
                await interaction.followUp({ content: responseMessage, flags: MessageFlags.Ephemeral });
            }

            // Toggle Seeder VIP Reward via CRCON API
            else if (
                customId === 'mapvote_toggle_seed_vip' ||
                customId.startsWith('mapvote_toggle_seed_vip_') ||
                customId === 'mapvote_toggle_seeding' ||
                customId.startsWith('mapvote_toggle_seeding_')
            ) {
                await interaction.deferUpdate();

                try {
                    const newEnabled = await crcon.toggleSeederVipRewardEnabled();

                    const panel = await mapVotePanelService.buildControlPanel(service, crcon, serverName);
                    await updatePanelMessage(interaction, panel);
                    await interaction.followUp({
                        content: `Seeder VIP Reward ${newEnabled ? 'enabled' : 'disabled'} for ${serverName} via CRCON.`,
                        flags: MessageFlags.Ephemeral
                    });
                } catch (e) {
                    logger.error(`Failed to toggle Seeder VIP Reward for ${serverName}:`, e);
                    await interaction.followUp({
                        content: `Failed to toggle Seeder VIP Reward via CRCON: ${e.message}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            // Refresh panel
            else if (customId === 'mapvote_refresh' || customId.startsWith('mapvote_refresh_')) {
                await interaction.deferUpdate();
                const panel = await mapVotePanelService.buildControlPanel(service, crcon, serverName);
                await updatePanelMessage(interaction, panel);
            }

            // Show whitelist panel
            else if (customId === 'mapvote_whitelist' || customId.startsWith('mapvote_whitelist_')) {
                await interaction.deferUpdate();
                const panel = await mapVotePanelService.buildWhitelistPanel(crcon);
                await updatePanelMessage(interaction, panel);
            }

            // Show blacklist panel
            else if (customId === 'mapvote_blacklist' || customId.startsWith('mapvote_blacklist_')) {
                await interaction.deferUpdate();
                const panel = await mapVotePanelService.buildBlacklistPanel(crcon);
                await updatePanelMessage(interaction, panel);
            }

            // Show history panel
            else if (customId === 'mapvote_history' || customId.startsWith('mapvote_history_')) {
                await interaction.deferUpdate();
                const panel = await mapVotePanelService.buildHistoryPanel(crcon);
                await updatePanelMessage(interaction, panel);
            }

            // Show settings panel
            else if (customId === 'mapvote_settings' || customId.startsWith('mapvote_settings_')) {
                await interaction.deferUpdate();
                const panel = mapVotePanelService.buildSettingsPanel(service);
                await updatePanelMessage(interaction, panel);
            }

            // Back to main panel
            else if (customId === 'mapvote_back') {
                await interaction.deferUpdate();
                const panel = await mapVotePanelService.buildControlPanel(service, crcon, serverName);
                await updatePanelMessage(interaction, panel);
            }

            // Reset current vote
            else if (customId === 'mapvote_reset_vote' || customId.startsWith('mapvote_reset_vote_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                try {
                    await crcon.resetVotemapState();
                    service.clearCache();
                    await interaction.editReply({ content: 'Vote state reset' });
                } catch (e) {
                    await interaction.editReply({ content: `Error: ${e.message}` });
                }
            }

            // Reset whitelist
            else if (customId === 'mapvote_reset_whitelist' || customId.startsWith('mapvote_reset_whitelist_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                try {
                    await crcon.resetVotemapWhitelist();
                    service.clearCache();
                    await interaction.editReply({ content: 'Whitelist reset to all maps' });
                } catch (e) {
                    await interaction.editReply({ content: `Error: ${e.message}` });
                }
            }

            // Whitelist filters
            else if (customId.startsWith('mapvote_wl_')) {
                await interaction.deferUpdate();

                let filter = null;
                let page = 0;

                if (customId === 'mapvote_wl_warfare') filter = 'warfare';
                else if (customId === 'mapvote_wl_offensive') filter = 'offensive';
                else if (customId === 'mapvote_wl_night') filter = 'night';
                else if (customId === 'mapvote_wl_day') filter = 'day';
                else if (customId.startsWith('mapvote_wl_prev_')) {
                    const parts = customId.split('_');
                    page = Math.max(0, parseInt(parts[3]) - 1);
                    filter = parts[4] !== 'all' ? parts[4] : null;
                }
                else if (customId.startsWith('mapvote_wl_next_')) {
                    const parts = customId.split('_');
                    page = parseInt(parts[3]) + 1;
                    filter = parts[4] !== 'all' ? parts[4] : null;
                }
                else if (customId === 'mapvote_wl_all_on') {
                    try {
                        await crcon.resetVotemapWhitelist();
                        service.clearCache();
                    } catch (e) {
                        logger.error('Error enabling all maps:', e);
                    }
                }
                else if (customId === 'mapvote_wl_all_off') {
                    try {
                        // Remove all maps from whitelist
                        const maps = await crcon.getMaps();
                        for (const map of (maps?.result || [])) {
                            await crcon.removeFromVotemapWhitelist(map.id);
                        }
                        service.clearCache();
                    } catch (e) {
                        logger.error('Error disabling all maps:', e);
                    }
                }

                const panel = await mapVotePanelService.buildWhitelistPanel(crcon, page, filter);
                await updatePanelMessage(interaction, panel);
            }

            // Settings modals
            else if (customId === 'mapvote_set_activate') {
                const modal = new ModalBuilder()
                    .setCustomId(`mapvote_modal_activate_${serverNum}`)
                    .setTitle('Set Minimum Players')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('value')
                                .setLabel('Minimum players to activate voting')
                                .setStyle(TextInputStyle.Short)
                                .setValue(String(service.minimumPlayers))
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            }

            else if (customId === 'mapvote_set_deactivate') {
                const modal = new ModalBuilder()
                    .setCustomId(`mapvote_modal_deactivate_${serverNum}`)
                    .setTitle('Set Deactivate Players')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('value')
                                .setLabel('Player count to deactivate voting')
                                .setStyle(TextInputStyle.Short)
                                .setValue(String(service.deactivatePlayers))
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            }

            else if (customId === 'mapvote_set_maps_count') {
                const modal = new ModalBuilder()
                    .setCustomId(`mapvote_modal_maps_count_${serverNum}`)
                    .setTitle('Set Maps Per Vote')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('value')
                                .setLabel('Number of maps in each vote')
                                .setStyle(TextInputStyle.Short)
                                .setValue(String(service.mapsPerVote))
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            }

            else if (customId === 'mapvote_set_night_count') {
                const modal = new ModalBuilder()
                    .setCustomId(`mapvote_modal_night_count_${serverNum}`)
                    .setTitle('Set Night Map Count')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('value')
                                .setLabel('Number of night maps per vote')
                                .setStyle(TextInputStyle.Short)
                                .setValue(String(service.nightMapCount))
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            }

            else if (customId === 'mapvote_set_cooldown') {
                const modal = new ModalBuilder()
                    .setCustomId(`mapvote_modal_cooldown_${serverNum}`)
                    .setTitle('Set Map Cooldown Votes')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('value')
                                .setLabel('Votes map stays out after being played')
                                .setStyle(TextInputStyle.Short)
                                .setValue(String(service.excludeRecentMaps ?? 3))
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            }

            // ========== SCHEDULE BUTTONS ==========
            else if (customId === 'mapvote_schedules' || customId.startsWith('mapvote_schedules_')) {
                await interaction.deferUpdate();
                const panel = schedulePanel.buildSchedulePanel(serverNum, serverName);
                await updatePanelMessage(interaction, panel);
            }

            else if (customId.startsWith('schedule_')) {
                // Extract server number from customId if present
                const parts = customId.split('_');
                const lastPart = parts[parts.length - 1];
                const schedServerNum = /^\d+$/.test(lastPart) ? parseInt(lastPart) : serverNum;

                // Schedule back button
                if (customId.startsWith('schedule_back_')) {
                    await interaction.deferUpdate();
                    const panel = schedulePanel.buildSchedulePanel(schedServerNum, serverName);
                    await updatePanelMessage(interaction, panel);
                }

                // Add schedule
                else if (customId.startsWith('schedule_add_')) {
                    const modal = schedulePanel.buildScheduleModal(schedServerNum);
                    await interaction.showModal(modal);
                }

                // Edit schedule - show selection
                else if (customId.startsWith('schedule_edit_') && !customId.includes('select')) {
                    await interaction.deferUpdate();
                    const panel = schedulePanel.buildScheduleSelectPanel(schedServerNum, 'edit');
                    await updatePanelMessage(interaction, panel);
                }

                // Delete schedule - show selection
                else if (customId.startsWith('schedule_delete_') && !customId.includes('select')) {
                    await interaction.deferUpdate();
                    const panel = schedulePanel.buildScheduleSelectPanel(schedServerNum, 'delete');
                    await updatePanelMessage(interaction, panel);
                }

                // Timezone selection
                else if (customId.startsWith('schedule_timezone_')) {
                    await interaction.deferUpdate();
                    const panel = schedulePanel.buildTimezonePanel(schedServerNum);
                    await updatePanelMessage(interaction, panel);
                }

                // Override panel
                else if (customId.startsWith('schedule_override_') && !customId.includes('select') && !customId.includes('match') && !customId.includes('hours')) {
                    await interaction.deferUpdate();
                    const panel = schedulePanel.buildOverridePanel(schedServerNum);
                    await updatePanelMessage(interaction, panel);
                }

                // Clear override
                else if (customId.startsWith('schedule_clear_override_')) {
                    await interaction.deferUpdate();
                    scheduleManager.clearOverride(schedServerNum);
                    const panel = schedulePanel.buildSchedulePanel(schedServerNum, serverName);
                    await updatePanelMessage(interaction, panel);
                    await interaction.followUp({ content: 'Override cleared.', flags: MessageFlags.Ephemeral });
                }

                // Override type: match
                else if (customId.startsWith('schedule_override_match_')) {
                    const idParts = customId.split('_');
                    const scheduleId = idParts[idParts.length - 1];
                    const srvNum = parseInt(idParts[idParts.length - 2]);

                    await interaction.deferUpdate();
                    scheduleManager.setOverride(srvNum, scheduleId, 'match');
                    const panel = schedulePanel.buildSchedulePanel(srvNum, serverName);
                    await updatePanelMessage(interaction, panel);
                    await interaction.followUp({ content: 'Override set until match ends.', flags: MessageFlags.Ephemeral });
                }

                // Override type: hours - show modal
                else if (customId.startsWith('schedule_override_hours_') && !customId.includes('modal')) {
                    const idParts = customId.split('_');
                    const scheduleId = idParts[idParts.length - 1];
                    const srvNum = parseInt(idParts[idParts.length - 2]);
                    const modal = schedulePanel.buildOverrideHoursModal(srvNum, scheduleId);
                    await interaction.showModal(modal);
                }

                // Days selection
                else if (customId.startsWith('schedule_days_')) {
                    const idParts = customId.split('_');
                    const scheduleId = idParts[idParts.length - 1];
                    const srvNum = parseInt(idParts[idParts.length - 2]);
                    const preset = idParts[2]; // all, weekdays, weekend

                    await interaction.deferUpdate();
                    const days = scheduleManager.getDayPresets()[preset];
                    scheduleManager.updateSchedule(srvNum, scheduleId, { days });
                    const panel = schedulePanel.buildSchedulePanel(srvNum, serverName);
                    await updatePanelMessage(interaction, panel);
                    await interaction.followUp({ content: `Days set to ${preset}.`, flags: MessageFlags.Ephemeral });
                }

                // Manage maps - show schedule selection
                else if (customId.startsWith('schedule_maps_')) {
                    await interaction.deferUpdate();
                    const srvNum = parseInt(customId.split('_').pop());
                    const panel = schedulePanel.buildScheduleMapSelectPanel(srvNum);
                    await updatePanelMessage(interaction, panel);
                }
            }

            // ========== SCHEDULE WHITELIST BUTTONS ==========
            else if (customId.startsWith('sched_wl_')) {
                const crcon = crconServices[serverNum];
                if (!crcon) {
                    return interaction.reply({ content: 'CRCON service not available.', flags: MessageFlags.Ephemeral });
                }

                // Parse common parts
                const parts = customId.split('_');

                // Use all maps mode
                if (customId.startsWith('sched_wl_useall_')) {
                    const srvNum = parseInt(parts[3]);
                    const scheduleId = parts[4];
                    await interaction.deferUpdate();
                    schedulePanel.setScheduleUseAllMaps(srvNum, scheduleId);
                    const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon);
                    await updatePanelMessage(interaction, panel);
                }

                // Custom selection mode
                else if (customId.startsWith('sched_wl_custom_')) {
                    const srvNum = parseInt(parts[3]);
                    const scheduleId = parts[4];
                    await interaction.deferUpdate();
                    await schedulePanel.initScheduleCustomWhitelist(srvNum, scheduleId, crcon);
                    const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon);
                    await updatePanelMessage(interaction, panel);
                }

                // Filter buttons
                else if (customId.startsWith('sched_wl_filter_')) {
                    const srvNum = parseInt(parts[3]);
                    const scheduleId = parts[4];
                    const filterType = parts[5];
                    const filter = filterType === 'all' ? null : filterType;
                    await interaction.deferUpdate();
                    const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon, 0, filter);
                    await updatePanelMessage(interaction, panel);
                }

                // Pagination
                else if (customId.startsWith('sched_wl_prev_') || customId.startsWith('sched_wl_next_')) {
                    const srvNum = parseInt(parts[3]);
                    const scheduleId = parts[4];
                    const currentPage = parseInt(parts[5]);
                    const filterType = parts[6];
                    const filter = filterType === 'all' ? null : filterType;
                    const newPage = customId.includes('_prev_') ? currentPage - 1 : currentPage + 1;
                    await interaction.deferUpdate();
                    const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon, newPage, filter);
                    await updatePanelMessage(interaction, panel);
                }

                // Add all maps (with filter)
                else if (customId.startsWith('sched_wl_add_all_')) {
                    const srvNum = parseInt(parts[4]);
                    const scheduleId = parts[5];
                    const filterType = parts[6];
                    const filter = filterType === 'all' ? null : filterType;
                    await interaction.deferUpdate();

                    const mapsResponse = await crcon.getMaps();
                    const allMaps = mapsResponse?.result || [];
                    schedulePanel.addAllMapsToSchedule(srvNum, scheduleId, allMaps, filter);

                    const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon, 0, filter);
                    await updatePanelMessage(interaction, panel);
                }

                // Remove all maps (with filter)
                else if (customId.startsWith('sched_wl_remove_all_')) {
                    const srvNum = parseInt(parts[4]);
                    const scheduleId = parts[5];
                    const filterType = parts[6];
                    const filter = filterType === 'all' ? null : filterType;
                    await interaction.deferUpdate();

                    const mapsResponse = await crcon.getMaps();
                    const allMaps = mapsResponse?.result || [];
                    schedulePanel.removeAllMapsFromSchedule(srvNum, scheduleId, allMaps, filter);

                    const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon, 0, filter);
                    await updatePanelMessage(interaction, panel);
                }
            }
        }

        // ========== SELECT MENU INTERACTIONS ==========
        else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;

            // ========== SETUP SELECT MENUS ==========
            if (customId === 'setup_select_edit') {
                if (!isServerOwner(interaction.member)) {
                    return interaction.reply({ content: 'Only server owners can modify setup.', flags: MessageFlags.Ephemeral });
                }
                const serverNum = interaction.values[0];
                const existingConfig = configManager.getServerConfig(serverNum);
                const modal = setupWizard.buildServerModal(serverNum, existingConfig);
                await interaction.showModal(modal);
            }

            else if (customId === 'setup_select_remove') {
                if (!isServerOwner(interaction.member)) {
                    return interaction.reply({ content: 'Only server owners can modify setup.', flags: MessageFlags.Ephemeral });
                }
                const serverNum = interaction.values[0];
                const config = configManager.getServerConfig(serverNum);
                setupWizard.removeServer(serverNum);
                await interaction.update(setupWizard.buildSetupPanel());
                await interaction.followUp({
                    content: `Server ${serverNum} (${config?.serverName || 'Unnamed'}) removed. Click **Apply & Restart** to apply changes.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            else if (customId === 'setup_select_admin_role') {
                if (!isServerOwner(interaction.member)) {
                    return interaction.reply({ content: 'Only server owners can modify setup.', flags: MessageFlags.Ephemeral });
                }
                const roleId = interaction.values[0];
                const role = interaction.guild.roles.cache.get(roleId);
                setupWizard.setAdminRole(roleId);
                await interaction.update(setupWizard.buildSetupPanel());
                await interaction.followUp({
                    content: `Admin role set to **${role?.name || 'Unknown'}**. Users with this role can now use all bot commands.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // ========== SCHEDULE SELECT MENUS ==========
            else if (customId.startsWith('schedule_set_timezone_')) {
                const srvNum = parseInt(customId.split('_').pop());
                const timezone = interaction.values[0];
                scheduleManager.setTimezone(srvNum, timezone);
                await interaction.update(schedulePanel.buildSchedulePanel(srvNum));
                await interaction.followUp({
                    content: `Timezone set to ${timezone}.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            else if (customId.startsWith('schedule_select_edit_')) {
                const srvNum = parseInt(customId.split('_').pop());
                const scheduleId = interaction.values[0];
                const schedules = scheduleManager.getSchedules(srvNum);
                const schedule = schedules.find(s => s.id === scheduleId);
                const modal = schedulePanel.buildScheduleModal(srvNum, schedule);
                await interaction.showModal(modal);
            }

            else if (customId.startsWith('schedule_select_delete_')) {
                const srvNum = parseInt(customId.split('_').pop());
                const scheduleId = interaction.values[0];
                const schedules = scheduleManager.getSchedules(srvNum);
                const schedule = schedules.find(s => s.id === scheduleId);
                scheduleManager.deleteSchedule(srvNum, scheduleId);
                await interaction.update(schedulePanel.buildSchedulePanel(srvNum));
                await interaction.followUp({
                    content: `Schedule "${schedule?.name || 'Unknown'}" deleted.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            else if (customId.startsWith('schedule_override_select_')) {
                const srvNum = parseInt(customId.split('_').pop());
                const scheduleId = interaction.values[0];
                await interaction.deferUpdate();
                const panel = schedulePanel.buildOverrideTypePanel(srvNum, scheduleId);
                await updatePanelMessage(interaction, panel);
            }

            // Select schedule for map management
            else if (customId.startsWith('schedule_select_maps_')) {
                const srvNum = parseInt(customId.split('_').pop());
                const scheduleId = interaction.values[0];
                const crcon = crconServices[srvNum] || crconServices[1];
                await interaction.deferUpdate();
                const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon);
                await updatePanelMessage(interaction, panel);
            }

            // Toggle maps in schedule whitelist
            else if (customId.startsWith('sched_wl_toggle_')) {
                const parts = customId.split('_');
                const srvNum = parseInt(parts[3]);
                const scheduleId = parts[4];
                const mapIds = interaction.values;
                const crcon = crconServices[srvNum] || crconServices[1];

                await interaction.deferUpdate();

                const mapsResponse = await crcon.getMaps();
                const allMaps = mapsResponse?.result || [];
                schedulePanel.toggleScheduleWhitelistMaps(srvNum, scheduleId, mapIds, allMaps);

                const panel = await schedulePanel.buildScheduleWhitelistPanel(srvNum, scheduleId, crcon);
                await updatePanelMessage(interaction, panel);
            }

            // ========== MAP VOTING SELECT MENUS ==========
            else if (customId === 'mapvote_wl_toggle_map') {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferUpdate();

                const mapId = interaction.values[0];
                if (mapId === 'none') return;

                // Determine server
                let serverNum = 1;
                const crcon = crconServices[serverNum];
                const service = mapVotingServices[serverNum];

                try {
                    // Check current state
                    const whitelist = await crcon.getVotemapWhitelist();
                    const isWhitelisted = whitelist?.result?.includes(mapId);

                    if (isWhitelisted) {
                        await crcon.removeFromVotemapWhitelist(mapId);
                        logger.info(`Removed ${mapId} from whitelist`);
                    } else {
                        await crcon.addToVotemapWhitelist(mapId);
                        logger.info(`Added ${mapId} to whitelist`);
                    }

                    service.clearCache();
                } catch (e) {
                    logger.error(`Error toggling map ${mapId}:`, e);
                }

                const panel = await mapVotePanelService.buildWhitelistPanel(crcon);
                await updatePanelMessage(interaction, panel);
            }
        }

        // ========== MODAL SUBMISSIONS ==========
        else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;

            // ========== SEEDING FORM MODALS ==========
            if (customId.startsWith('seed_modal_form_')) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const idParts = customId.split('_');
                const formType = `${idParts[3]}_${idParts[4]}`; // seeding_enforcement, seeding_caps, seedvip_poll, seedvip_requirements
                const serverNum = parseInt(idParts[5], 10) || 1;
                const crcon = crconServices[serverNum];
                const config = configManager.getEffectiveServerConfig(serverNum);
                const serverName = config.serverName || `Server ${serverNum}`;

                if (!crcon) {
                    await interaction.editReply({ content: 'CRCON service not available for this server.' });
                    return;
                }

                try {
                    await seedingDraftStore.getOrCreate(crcon, interaction.guildId, interaction.user.id, serverNum);

                    if (formType === 'seeding_enforcement') {
                        const patch = {
                            number_of_warnings: parseBoundedInt(interaction.fields.getTextInputValue('number_of_warnings'), 'number_of_warnings', 0, 20),
                            warning_interval_seconds: parseBoundedInt(interaction.fields.getTextInputValue('warning_interval_seconds'), 'warning_interval_seconds', 0, 600),
                            number_of_punishments: parseBoundedInt(interaction.fields.getTextInputValue('number_of_punishments'), 'number_of_punishments', -1, 50),
                            punish_interval_seconds: parseBoundedInt(interaction.fields.getTextInputValue('punish_interval_seconds'), 'punish_interval_seconds', 0, 600),
                            kick_grace_period_seconds: parseBoundedInt(interaction.fields.getTextInputValue('kick_grace_period_seconds'), 'kick_grace_period_seconds', 0, 3600)
                        };
                        seedingDraftStore.applySeedingPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else if (formType === 'seeding_caps') {
                        const patch = {
                            dont_do_anything_below_this_number_of_players: parseBoundedInt(
                                interaction.fields.getTextInputValue('dont_do_anything_below_this_number_of_players'),
                                'dont_do_anything_below_this_number_of_players',
                                0,
                                100
                            ),
                            disallowed_roles: {
                                max_players: parseBoundedInt(interaction.fields.getTextInputValue('disallowed_roles_max_players'), 'disallowed_roles.max_players', 0, 100)
                            },
                            disallowed_weapons: {
                                max_players: parseBoundedInt(interaction.fields.getTextInputValue('disallowed_weapons_max_players'), 'disallowed_weapons.max_players', 0, 100)
                            },
                            enforce_cap_fight: {
                                max_players: parseBoundedInt(interaction.fields.getTextInputValue('enforce_cap_fight_max_players'), 'enforce_cap_fight.max_players', 0, 100),
                                max_caps: parseBoundedInt(interaction.fields.getTextInputValue('enforce_cap_fight_max_caps'), 'enforce_cap_fight.max_caps', 2, 4)
                            }
                        };
                        seedingDraftStore.applySeedingPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else if (formType === 'seedvip_poll') {
                        const thresholdsRaw = interaction.fields.getTextInputValue('player_announce_thresholds_csv');
                        const thresholds = thresholdsRaw
                            .split(',')
                            .map(v => parseBoundedInt(v, 'player_announce_thresholds item', 0, 100))
                            .filter((value, idx, arr) => arr.indexOf(value) === idx)
                            .sort((a, b) => a - b);

                        const patch = {
                            poll_time_seeding: parseBoundedInt(interaction.fields.getTextInputValue('poll_time_seeding'), 'poll_time_seeding', 0, 3600),
                            poll_time_seeded: parseBoundedInt(interaction.fields.getTextInputValue('poll_time_seeded'), 'poll_time_seeded', 0, 7200),
                            player_announce_thresholds: thresholds,
                            requirements: {
                                max_allies: parseBoundedInt(interaction.fields.getTextInputValue('requirements_max_allies'), 'requirements.max_allies', 0, 50),
                                max_axis: parseBoundedInt(interaction.fields.getTextInputValue('requirements_max_axis'), 'requirements.max_axis', 0, 50)
                            }
                        };
                        seedingDraftStore.applySeedVipPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else if (formType === 'seedvip_requirements') {
                        const patch = {
                            requirements: {
                                buffer: {
                                    minutes: parseBoundedInt(interaction.fields.getTextInputValue('buffer_minutes'), 'requirements.buffer.minutes', 0, 600)
                                },
                                minimum_play_time: {
                                    minutes: parseBoundedInt(interaction.fields.getTextInputValue('minimum_play_time_minutes'), 'requirements.minimum_play_time.minutes', 0, 600)
                                },
                                online_when_seeded: parseBooleanStrict(interaction.fields.getTextInputValue('online_when_seeded'), 'requirements.online_when_seeded')
                            },
                            reward: {
                                timeframe: {
                                    days: parseBoundedInt(interaction.fields.getTextInputValue('reward_days'), 'reward.timeframe.days', 0, 365),
                                    hours: parseBoundedInt(interaction.fields.getTextInputValue('reward_hours'), 'reward.timeframe.hours', 0, 23)
                                }
                            }
                        };
                        seedingDraftStore.applySeedVipPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else if (formType === 'seeding_messages') {
                        const patch = {
                            announcement_message: interaction.fields.getTextInputValue('announcement_message'),
                            warning_message: interaction.fields.getTextInputValue('warning_message'),
                            punish_message: interaction.fields.getTextInputValue('punish_message'),
                            kick_message: interaction.fields.getTextInputValue('kick_message')
                        };
                        seedingDraftStore.applySeedingPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else if (formType === 'seedvip_messages') {
                        const patch = {
                            player_messages: {
                                seeding_in_progress_message: interaction.fields.getTextInputValue('seeding_in_progress_message'),
                                seeding_complete_message: interaction.fields.getTextInputValue('seeding_complete_message'),
                                player_count_message: interaction.fields.getTextInputValue('player_count_message'),
                                reward_player_message: interaction.fields.getTextInputValue('reward_player_message'),
                                reward_player_message_no_vip: interaction.fields.getTextInputValue('reward_player_message_no_vip')
                            }
                        };
                        seedingDraftStore.applySeedVipPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else {
                        await interaction.editReply({ content: 'Unknown form type.' });
                        return;
                    }

                    const session = seedingDraftStore.get(interaction.guildId, interaction.user.id, serverNum);
                    const summary = seedingDraftStore.getSummary(session);
                    await interaction.editReply({ content: `Draft updated from form for ${serverName}.` });

                    if (interaction.message) {
                        const panel = await seedingPanelService.buildMainPanel(crcon, serverName, serverNum, session, summary);
                        await interaction.message.edit(panel);
                    }
                } catch (e) {
                    logger.error(`Failed to apply seeding form modal for ${serverName}:`, e);
                    await interaction.editReply({ content: `Failed to update draft: ${e.message}` });
                }
                return;
            }

            // ========== SEEDING PATCH MODALS ==========
            if (customId.startsWith('seed_modal_patch_')) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const idParts = customId.split('_');
                const kind = idParts[3]; // seeding|seedvip
                const serverNum = parseInt(idParts[4], 10) || 1;
                const crcon = crconServices[serverNum];
                const config = configManager.getEffectiveServerConfig(serverNum);
                const serverName = config.serverName || `Server ${serverNum}`;

                if (!crcon) {
                    await interaction.editReply({ content: 'CRCON service not available for this server.' });
                    return;
                }

                const rawJson = interaction.fields.getTextInputValue('json_patch');
                let patch;
                try {
                    patch = JSON.parse(rawJson);
                } catch (e) {
                    await interaction.editReply({ content: `Invalid JSON patch: ${e.message}` });
                    return;
                }

                if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
                    await interaction.editReply({ content: 'JSON patch must be an object (e.g. {"enabled": true}).' });
                    return;
                }

                try {
                    await seedingDraftStore.getOrCreate(crcon, interaction.guildId, interaction.user.id, serverNum);
                    if (kind === 'seeding') {
                        seedingDraftStore.applySeedingPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else if (kind === 'seedvip') {
                        seedingDraftStore.applySeedVipPatch(interaction.guildId, interaction.user.id, serverNum, patch);
                    } else {
                        await interaction.editReply({ content: 'Unknown patch type.' });
                        return;
                    }

                    const session = seedingDraftStore.get(interaction.guildId, interaction.user.id, serverNum);
                    const summary = seedingDraftStore.getSummary(session);

                    const changedKeys = kind === 'seeding' ? summary.seedingChanged : summary.seedVipChanged;
                    const preview = changedKeys.slice(0, 12).join(', ') || 'none';

                    await interaction.editReply({
                        content: `Patch applied to draft for ${serverName}. Changed top-level keys (${changedKeys.length}): ${preview}`
                    });

                    if (interaction.message) {
                        const panel = await seedingPanelService.buildMainPanel(crcon, serverName, serverNum, session, summary);
                        await interaction.message.edit(panel);
                    }
                } catch (e) {
                    logger.error(`Failed to apply seed patch modal for ${serverName}:`, e);
                    await interaction.editReply({ content: `Failed to apply patch: ${e.message}` });
                }
                return;
            }

            // ========== SCHEDULE MODALS ==========
            if (customId.startsWith('schedule_modal_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                // Parse server num and optional schedule id
                const idParts = customId.replace('schedule_modal_', '').split('_');
                const srvNum = parseInt(idParts[0]);
                const scheduleId = idParts[1] || null;

                const result = schedulePanel.processScheduleModal(interaction, srvNum, scheduleId);

                if (result.success) {
                    const action = result.isNew ? 'created' : 'updated';
                    await interaction.editReply({ content: `Schedule ${action} successfully!` });

                    // Show day selection for new schedules
                    if (result.isNew && result.schedule) {
                        const panel = schedulePanel.buildDaySelectPanel(srvNum, result.schedule.id);
                        await updatePanelMessage(interaction, panel, { preferMessageEdit: true });
                    } else {
                        const panel = schedulePanel.buildSchedulePanel(srvNum);
                        await updatePanelMessage(interaction, panel, { preferMessageEdit: true });
                    }
                } else {
                    await interaction.editReply({ content: `Error: ${result.error}` });
                }
                return;
            }

            // Override hours modal
            if (customId.startsWith('schedule_override_hours_modal_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const idParts = customId.replace('schedule_override_hours_modal_', '').split('_');
                const srvNum = parseInt(idParts[0]);
                const scheduleId = idParts[1];
                const hours = parseInt(interaction.fields.getTextInputValue('hours'));

                if (isNaN(hours) || hours < 1 || hours > 24) {
                    await interaction.editReply({ content: 'Hours must be between 1 and 24.' });
                    return;
                }

                scheduleManager.setOverride(srvNum, scheduleId, 'hours', hours);
                await interaction.editReply({ content: `Override set for ${hours} hour(s).` });
                const panel = schedulePanel.buildSchedulePanel(srvNum);
                await updatePanelMessage(interaction, panel, { preferMessageEdit: true });
                return;
            }

            // ========== SETUP MODAL ==========
            if (customId.startsWith('setup_modal_server_')) {
                if (!isServerOwner(interaction.member)) {
                    return interaction.reply({ content: 'Only server owners can modify setup.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const result = await setupWizard.saveServerFromModal(interaction);

                if (result.success) {
                    await interaction.editReply({ content: result.message });
                    // Update the setup panel
                    const channel = interaction.channel;
                    const messages = await channel.messages.fetch({ limit: 10 });
                    const setupMessage = messages.find(m =>
                        m.author.id === client.user.id &&
                        m.embeds[0]?.title === 'Frontline Democracy Setup'
                    );
                    if (setupMessage) {
                        await setupMessage.edit(setupWizard.buildSetupPanel());
                    }
                } else {
                    await interaction.editReply({ content: result.message });
                }
                return;
            }

            // ========== MAP VOTING MODALS ==========
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: 'You do not have permission.', flags: MessageFlags.Ephemeral });
            }

            const value = interaction.fields.getTextInputValue('value');

            // Determine server
            let serverNum = 1;
            if (customId.startsWith('mapvote_modal_')) {
                const parsedServerNum = parseInt(customId.split('_').pop(), 10);
                if (!Number.isNaN(parsedServerNum)) {
                    serverNum = parsedServerNum;
                }
            }
            const service = mapVotingServices[serverNum];
            const crcon = crconServices[serverNum];
            const config = configManager.getEffectiveServerConfig(serverNum);
            const serverName = config.serverName || `Server ${serverNum}`;

            if (!service) {
                return interaction.reply({ content: 'Service not available', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferUpdate();

            if (customId.startsWith('mapvote_modal_activate_')) {
                service.setConfig('minimumPlayers', value);
            }
            else if (customId.startsWith('mapvote_modal_deactivate_')) {
                service.setConfig('deactivatePlayers', value);
            }
            else if (customId.startsWith('mapvote_modal_maps_count_')) {
                service.setConfig('mapsPerVote', value);
            }
            else if (customId.startsWith('mapvote_modal_night_count_')) {
                service.setConfig('nightMapCount', value);
            }
            else if (customId.startsWith('mapvote_modal_cooldown_')) {
                service.setConfig('excludeRecentMaps', value);
                configManager.setServerConfig(serverNum, {
                    excludePlayedMapForXvotes: service.excludeRecentMaps
                });
            }

            const panel = mapVotePanelService.buildSettingsPanel(service);
            await updatePanelMessage(interaction, panel);
        }

    } catch (error) {
        logger.error('Interaction error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred', flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            // Ignore
        }
    }
});

// Error handling
client.on('error', (error) => {
    logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection:', error);
});

// Login
const token = process.env.DISCORD_TOKEN;
if (!token) {
    logger.error('DISCORD_TOKEN not set in environment');
    process.exit(1);
}

client.login(token);
