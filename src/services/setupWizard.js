/**
 * Setup Wizard Service
 * Handles Discord-based configuration for the bot
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const axios = require('axios');
const configManager = require('./configManager');
const logger = require('../utils/logger');

class SetupWizard {
    constructor() {
        this.pendingSetups = new Map(); // Track setup state per user
    }

    // Build the main setup panel
    buildSetupPanel() {
        const servers = configManager.getAllServers();
        const serverCount = Object.keys(servers).length;
        const adminRoleId = configManager.getAdminRoleId();

        const embed = new EmbedBuilder()
            .setTitle('Seeding Bot Setup')
            .setDescription('Configure your CRCON servers and permissions for map voting')
            .setColor(serverCount > 0 ? 0x00FF00 : 0xFF6600);

        // Show admin role
        const roleDisplay = adminRoleId ? `<@&${adminRoleId}>` : '`Not set (Server Owner only)`';
        embed.addFields({
            name: 'Admin Role',
            value: `${roleDisplay}\nUsers with this role can use all bot commands.`,
            inline: false
        });

        // Show configured servers
        if (serverCount > 0) {
            let serverList = '';
            for (const [num, config] of Object.entries(servers)) {
                serverList += `**Server ${num}** - ${config.serverName || 'Unnamed'}\n`;
                serverList += `URL: \`${config.crconUrl || 'Not set'}\`\n`;
                serverList += `Channel: ${config.channelId ? `<#${config.channelId}>` : '`Not set`'}\n\n`;
            }
            embed.addFields({ name: 'Configured Servers', value: serverList || 'None' });
        } else {
            embed.addFields({
                name: 'Getting Started',
                value: 'Click **Add Server** to configure your first HLL server.\n\nYou will need:\n- Your CRCON URL (e.g., `http://your-crcon.com:8010`)\n- Your CRCON API Token\n- A Discord channel ID for map voting'
            });
        }

        // Buttons - Row 1: Admin Role
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_set_admin_role')
                .setLabel('Set Admin Role')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👑'),
            new ButtonBuilder()
                .setCustomId('setup_clear_admin_role')
                .setLabel('Clear Admin Role')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!adminRoleId)
        );

        // Buttons - Row 2: Server management
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_add_server')
                .setLabel('Add Server')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setCustomId('setup_edit_server')
                .setLabel('Edit Server')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✏️')
                .setDisabled(serverCount === 0),
            new ButtonBuilder()
                .setCustomId('setup_remove_server')
                .setLabel('Remove Server')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
                .setDisabled(serverCount === 0)
        );

        // Buttons - Row 3: Actions
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_test_connection')
                .setLabel('Test Connections')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔌')
                .setDisabled(serverCount === 0),
            new ButtonBuilder()
                .setCustomId('setup_refresh')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('setup_apply_restart')
                .setLabel('Apply & Restart')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
                .setDisabled(serverCount === 0)
        );

        return { embeds: [embed], components: [row1, row2, row3] };
    }

    // Build admin role selection
    buildAdminRolePanel(roles) {
        const embed = new EmbedBuilder()
            .setTitle('Select Admin Role')
            .setDescription('Choose a role that will have access to all Seeding Bot commands.\n\n**Note:** Server owners always have access regardless of role.')
            .setColor(0x5865F2);

        // Filter to manageable roles (not @everyone, not bot roles)
        // Convert Collection to array since Collections don't have .slice()
        const selectableRoles = Array.from(roles.values())
            .filter(role => role.name !== '@everyone' && !role.managed)
            .sort((a, b) => b.position - a.position)
            .slice(0, 25); // Discord limit

        if (selectableRoles.length === 0) {
            embed.setDescription('No suitable roles found. Create a role first, then try again.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_back')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
            );
            return { embeds: [embed], components: [row] };
        }

        const options = selectableRoles.map(role => ({
            label: role.name.slice(0, 100),
            description: `${role.members?.size || 0} members`,
            value: role.id
        }));

        const row1 = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('setup_select_admin_role')
                .setPlaceholder('Select a role...')
                .addOptions(options)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row1, row2] };
    }

    // Set admin role
    setAdminRole(roleId) {
        return configManager.setAdminRoleId(roleId);
    }

    // Clear admin role
    clearAdminRole() {
        return configManager.clearAdminRole();
    }

    // Build server selection menu
    buildServerSelectMenu(action) {
        const servers = configManager.getAllServers();

        if (Object.keys(servers).length === 0) {
            return null;
        }

        const options = Object.entries(servers).map(([num, config]) => ({
            label: `Server ${num} - ${config.serverName || 'Unnamed'}`,
            description: config.crconUrl || 'Not configured',
            value: num
        }));

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`setup_select_${action}`)
                .setPlaceholder(`Select a server to ${action}`)
                .addOptions(options)
        );

        const embed = new EmbedBuilder()
            .setTitle(`Select Server to ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setColor(0x5865F2);

        return { embeds: [embed], components: [row] };
    }

    // Build the add/edit server modal
    buildServerModal(serverNum = null, existingConfig = null) {
        const isEdit = serverNum !== null && existingConfig !== null;
        const nextServerNum = serverNum || this.getNextServerNumber();

        const modal = new ModalBuilder()
            .setCustomId(`setup_modal_server_${nextServerNum}`)
            .setTitle(isEdit ? `Edit Server ${serverNum}` : `Add Server ${nextServerNum}`);

        const nameInput = new TextInputBuilder()
            .setCustomId('server_name')
            .setLabel('Server Name (for display)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., My HLL Server')
            .setValue(existingConfig?.serverName || '')
            .setRequired(true)
            .setMaxLength(50);

        const urlInput = new TextInputBuilder()
            .setCustomId('crcon_url')
            .setLabel('CRCON URL')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('http://your-crcon.com:8010')
            .setValue(existingConfig?.crconUrl || '')
            .setRequired(true);

        const tokenInput = new TextInputBuilder()
            .setCustomId('crcon_token')
            .setLabel('CRCON API Token')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
            .setValue(existingConfig?.crconToken || '')
            .setRequired(true);

        const channelInput = new TextInputBuilder()
            .setCustomId('channel_id')
            .setLabel('Map Vote Channel ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Right-click channel > Copy ID')
            .setValue(existingConfig?.channelId || '')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(urlInput),
            new ActionRowBuilder().addComponents(tokenInput),
            new ActionRowBuilder().addComponents(channelInput)
        );

        return modal;
    }

    getNextServerNumber() {
        const servers = configManager.getAllServers();
        for (let i = 1; i <= 4; i++) {
            if (!servers[i]) return i;
        }
        return null; // Max 4 servers
    }

    // Test CRCON connection
    async testConnection(crconUrl, crconToken) {
        try {
            const baseUrl = crconUrl.replace(/\/$/, '');
            const response = await axios.get(`${baseUrl}/api/get_status`, {
                headers: {
                    'Authorization': `Bearer ${crconToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            if (response.data && response.data.result) {
                return {
                    success: true,
                    serverName: response.data.result.name || 'Unknown Server',
                    players: response.data.result.current_players || 0,
                    maxPlayers: response.data.result.max_players || 100
                };
            }

            return { success: false, error: 'Invalid response from CRCON' };
        } catch (error) {
            let errorMsg = 'Connection failed';
            if (error.code === 'ECONNREFUSED') {
                errorMsg = 'Connection refused - check URL';
            } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                errorMsg = 'Connection timed out';
            } else if (error.response?.status === 401 || error.response?.status === 403) {
                errorMsg = 'Invalid API token';
            } else if (error.response?.status === 404) {
                errorMsg = 'CRCON API not found at URL';
            }
            return { success: false, error: errorMsg };
        }
    }

    // Test all configured servers
    async testAllConnections() {
        const servers = configManager.getAllServers();
        const results = [];

        for (const [num, config] of Object.entries(servers)) {
            if (config.crconUrl && config.crconToken) {
                const result = await this.testConnection(config.crconUrl, config.crconToken);
                results.push({
                    serverNum: num,
                    serverName: config.serverName,
                    ...result
                });
            }
        }

        return results;
    }

    // Build test results embed
    buildTestResultsEmbed(results) {
        const embed = new EmbedBuilder()
            .setTitle('Connection Test Results')
            .setColor(results.every(r => r.success) ? 0x00FF00 : 0xFF0000);

        for (const result of results) {
            if (result.success) {
                embed.addFields({
                    name: `Server ${result.serverNum} - ${result.serverName}`,
                    value: `Connected to: **${result.serverName}**\nPlayers: ${result.players}/${result.maxPlayers}`,
                    inline: true
                });
            } else {
                embed.addFields({
                    name: `Server ${result.serverNum} - ${result.serverName}`,
                    value: `**Failed:** ${result.error}`,
                    inline: true
                });
            }
        }

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_back')
                .setLabel('Back to Setup')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [backRow] };
    }

    // Save server from modal submission
    async saveServerFromModal(interaction) {
        const serverNum = interaction.customId.split('_').pop();

        const config = {
            serverName: interaction.fields.getTextInputValue('server_name'),
            crconUrl: interaction.fields.getTextInputValue('crcon_url').replace(/\/$/, ''),
            crconToken: interaction.fields.getTextInputValue('crcon_token'),
            channelId: interaction.fields.getTextInputValue('channel_id')
        };

        // Validate channel ID is numeric
        if (!/^\d+$/.test(config.channelId)) {
            return {
                success: false,
                message: 'Channel ID must be a number. Right-click the channel and select "Copy ID".'
            };
        }

        // Test connection before saving
        const testResult = await this.testConnection(config.crconUrl, config.crconToken);
        if (!testResult.success) {
            return {
                success: false,
                message: `Connection test failed: ${testResult.error}\n\nConfiguration NOT saved. Please check your CRCON URL and token.`
            };
        }

        // Save config
        configManager.setServerConfig(serverNum, config);

        return {
            success: true,
            message: `Server ${serverNum} configured successfully!\n\n**Connected to:** ${testResult.serverName}\n**Players:** ${testResult.players}/${testResult.maxPlayers}\n\nClick **Apply & Restart** to activate the changes.`
        };
    }

    // Remove a server
    removeServer(serverNum) {
        return configManager.removeServerConfig(serverNum);
    }
}

module.exports = new SetupWizard();

