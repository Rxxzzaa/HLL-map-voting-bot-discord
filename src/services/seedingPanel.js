const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const logger = require('../utils/logger');

class SeedingPanelService {
    async buildMainPanel(crconService, serverName = 'Server', serverNum = 1, session = null, summary = null) {
        const embed = new EmbedBuilder()
            .setTitle(`🌱 Seeding Control Panel - ${serverName}`)
            .setColor(0x2ECC71)
            .setTimestamp();

        try {
            const [statusResponse, seedingResponse, seedVipResponse] = await Promise.all([
                crconService.getStatus().catch(() => null),
                session ? { result: session.seedingDraft } : crconService.getSeedingRulesConfig().catch(() => null),
                session ? { result: session.seedVipDraft } : crconService.getSeedVipConfig().catch(() => null)
            ]);

            const status = statusResponse?.result || {};
            const seeding = seedingResponse?.result || {};
            const seedVip = seedVipResponse?.result || {};

            const playerCount = status.current_players || 0;
            const maxPlayers = status.max_players || 100;
            const mapName = status.map?.pretty_name || status.name || 'Unknown';

            const rolesCount = Object.keys(seeding.disallowed_roles?.roles || {}).length;
            const weaponsCount = Object.keys(seeding.disallowed_weapons?.weapons || {}).length;
            const thresholdsCount = Array.isArray(seedVip.player_announce_thresholds)
                ? seedVip.player_announce_thresholds.length
                : 0;
            const hooksCount = Array.isArray(seedVip.hooks) ? seedVip.hooks.length : 0;

            embed.addFields(
                {
                    name: '🖥️ Server',
                    value: `**Players:** ${playerCount}/${maxPlayers}\n` +
                        `**Current Map:** ${String(mapName).substring(0, 40)}`,
                    inline: true
                },
                {
                    name: '🚨 AutoMod Seeding',
                    value: `**Enabled:** ${seeding.enabled ? '✅' : '❌'}\n` +
                        `**Dry Run:** ${seeding.dry_run ? '✅' : '❌'}\n` +
                        `**Warnings/Punishes:** ${seeding.number_of_warnings ?? 0}/${seeding.number_of_punishments ?? 0}\n` +
                        `**Rules:** ${rolesCount} roles, ${weaponsCount} weapons`,
                    inline: true
                },
                {
                    name: '🎖️ Seed VIP Rewards',
                    value: `**Enabled:** ${seedVip.enabled ? '✅' : '❌'}\n` +
                        `**Dry Run:** ${seedVip.dry_run ? '✅' : '❌'}\n` +
                        `**Thresholds:** ${thresholdsCount}\n` +
                        `**Hooks:** ${hooksCount}`,
                    inline: true
                }
            );

            if (summary) {
                embed.addFields({
                    name: '📝 Draft Changes',
                    value: `**Seeding Changed Keys:** ${summary.seedingChanged.length}\n` +
                        `**Seed VIP Changed Keys:** ${summary.seedVipChanged.length}\n` +
                        `**Draft Status:** ${summary.hasSeedingChanges || summary.hasSeedVipChanges ? '⚠️ Unsaved changes' : '✅ In sync'}`,
                    inline: false
                });
            }
        } catch (error) {
            logger.error('[SeedingPanel] Error building panel:', error);
            embed.setColor(0xE74C3C).setDescription(`Failed to load CRCON seeding data: ${error.message}`);
        }

        embed.setFooter({ text: 'Phase 2 panel: draft patches + validate/apply flow' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`seed_toggle_seeding_${serverNum}`)
                .setLabel('Toggle Seeding Rules')
                .setEmoji('🚨')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`seed_toggle_vip_${serverNum}`)
                .setLabel('Toggle Seed VIP')
                .setEmoji('🎖️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`seed_refresh_${serverNum}`)
                .setLabel('Refresh')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Success)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`seed_edit_seeding_json_${serverNum}`)
                .setLabel('Patch Seeding JSON')
                .setEmoji('🧩')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`seed_edit_seedvip_json_${serverNum}`)
                .setLabel('Patch Seed VIP JSON')
                .setEmoji('🧩')
                .setStyle(ButtonStyle.Secondary)
        );

        const hasChanges = summary ? (summary.hasSeedingChanges || summary.hasSeedVipChanges) : false;
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`seed_validate_${serverNum}`)
                .setLabel('Validate Draft')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`seed_apply_${serverNum}`)
                .setLabel('Apply Draft')
                .setEmoji('💾')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!hasChanges),
            new ButtonBuilder()
                .setCustomId(`seed_discard_${serverNum}`)
                .setLabel('Discard Draft')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!hasChanges)
        );

        const row4 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`seed_form_seeding_enforcement_${serverNum}`)
                .setLabel('Seeding Enforcement')
                .setEmoji('⚠️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`seed_form_seeding_caps_${serverNum}`)
                .setLabel('Seeding Cap Rules')
                .setEmoji('🎯')
                .setStyle(ButtonStyle.Secondary)
        );

        const row5 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`seed_form_seedvip_poll_${serverNum}`)
                .setLabel('Seed VIP Polling')
                .setEmoji('📣')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`seed_form_seedvip_requirements_${serverNum}`)
                .setLabel('Seed VIP Requirements')
                .setEmoji('📏')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`seed_form_seeding_messages_${serverNum}`)
                .setLabel('Seeding Messages')
                .setEmoji('💬')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`seed_form_seedvip_messages_${serverNum}`)
                .setLabel('Seed VIP Messages')
                .setEmoji('📝')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
    }

    buildPatchModal(kind, serverNum) {
        const isSeeding = kind === 'seeding';
        const modal = new ModalBuilder()
            .setCustomId(`seed_modal_patch_${kind}_${serverNum}`)
            .setTitle(isSeeding ? `Patch Seeding Config (S${serverNum})` : `Patch Seed VIP Config (S${serverNum})`);

        const input = new TextInputBuilder()
            .setCustomId('json_patch')
            .setLabel('JSON Patch (partial object)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(isSeeding
                ? '{\"enabled\": true, \"warning_interval_seconds\": 20}'
                : '{\"enabled\": true, \"poll_time_seeding\": 30, \"requirements\": {\"max_allies\": 25, \"max_axis\": 25}}')
            .setRequired(true)
            .setMaxLength(3800);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return modal;
    }

    buildSeedingEnforcementModal(serverNum, seedingDraft = {}) {
        const modal = new ModalBuilder()
            .setCustomId(`seed_modal_form_seeding_enforcement_${serverNum}`)
            .setTitle(`Seeding Enforcement (S${serverNum})`);

        const fields = [
            new TextInputBuilder()
                .setCustomId('number_of_warnings')
                .setLabel('Number of Warnings')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.number_of_warnings ?? 1)),
            new TextInputBuilder()
                .setCustomId('warning_interval_seconds')
                .setLabel('Warning Interval Seconds')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.warning_interval_seconds ?? 20)),
            new TextInputBuilder()
                .setCustomId('number_of_punishments')
                .setLabel('Number of Punishments')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.number_of_punishments ?? 2)),
            new TextInputBuilder()
                .setCustomId('punish_interval_seconds')
                .setLabel('Punish Interval Seconds')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.punish_interval_seconds ?? 59)),
            new TextInputBuilder()
                .setCustomId('kick_grace_period_seconds')
                .setLabel('Kick Grace Period Seconds')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.kick_grace_period_seconds ?? 60))
        ];

        modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
        return modal;
    }

    buildSeedingCapsModal(serverNum, seedingDraft = {}) {
        const modal = new ModalBuilder()
            .setCustomId(`seed_modal_form_seeding_caps_${serverNum}`)
            .setTitle(`Seeding Cap Rules (S${serverNum})`);

        const fields = [
            new TextInputBuilder()
                .setCustomId('disallowed_roles_max_players')
                .setLabel('Disallowed Roles Max Players')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.disallowed_roles?.max_players ?? 49)),
            new TextInputBuilder()
                .setCustomId('disallowed_weapons_max_players')
                .setLabel('Disallowed Weapons Max Players')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.disallowed_weapons?.max_players ?? 49)),
            new TextInputBuilder()
                .setCustomId('enforce_cap_fight_max_players')
                .setLabel('Cap Fight Max Players')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.enforce_cap_fight?.max_players ?? 49)),
            new TextInputBuilder()
                .setCustomId('enforce_cap_fight_max_caps')
                .setLabel('Cap Fight Max Caps (2-4)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.enforce_cap_fight?.max_caps ?? 3)),
            new TextInputBuilder()
                .setCustomId('dont_do_anything_below_this_number_of_players')
                .setLabel('Global Minimum Server Players')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedingDraft.dont_do_anything_below_this_number_of_players ?? 0))
        ];

        modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
        return modal;
    }

    buildSeedVipPollModal(serverNum, seedVipDraft = {}) {
        const modal = new ModalBuilder()
            .setCustomId(`seed_modal_form_seedvip_poll_${serverNum}`)
            .setTitle(`Seed VIP Polling (S${serverNum})`);

        const fields = [
            new TextInputBuilder()
                .setCustomId('poll_time_seeding')
                .setLabel('Poll Time Seeding (sec)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.poll_time_seeding ?? 30)),
            new TextInputBuilder()
                .setCustomId('poll_time_seeded')
                .setLabel('Poll Time Seeded (sec)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.poll_time_seeded ?? 300)),
            new TextInputBuilder()
                .setCustomId('player_announce_thresholds_csv')
                .setLabel('Announce Thresholds CSV')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue((seedVipDraft.player_announce_thresholds || [10, 20, 35, 45, 50, 60]).join(',')),
            new TextInputBuilder()
                .setCustomId('requirements_max_allies')
                .setLabel('Requirements Max Allies')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.requirements?.max_allies ?? 25)),
            new TextInputBuilder()
                .setCustomId('requirements_max_axis')
                .setLabel('Requirements Max Axis')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.requirements?.max_axis ?? 25))
        ];

        modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
        return modal;
    }

    buildSeedVipRequirementsModal(serverNum, seedVipDraft = {}) {
        const modal = new ModalBuilder()
            .setCustomId(`seed_modal_form_seedvip_requirements_${serverNum}`)
            .setTitle(`Seed VIP Requirements (S${serverNum})`);

        const fields = [
            new TextInputBuilder()
                .setCustomId('buffer_minutes')
                .setLabel('Buffer Minutes')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.requirements?.buffer?.minutes ?? 20)),
            new TextInputBuilder()
                .setCustomId('minimum_play_time_minutes')
                .setLabel('Minimum Play Time Minutes')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.requirements?.minimum_play_time?.minutes ?? 25)),
            new TextInputBuilder()
                .setCustomId('reward_days')
                .setLabel('Reward Timeframe Days')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.reward?.timeframe?.days ?? 3)),
            new TextInputBuilder()
                .setCustomId('reward_hours')
                .setLabel('Reward Timeframe Hours')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.reward?.timeframe?.hours ?? 2)),
            new TextInputBuilder()
                .setCustomId('online_when_seeded')
                .setLabel('Online When Seeded (true/false)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(seedVipDraft.requirements?.online_when_seeded ?? true))
        ];

        modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
        return modal;
    }

    buildSeedingMessagesModal(serverNum, seedingDraft = {}) {
        const modal = new ModalBuilder()
            .setCustomId(`seed_modal_form_seeding_messages_${serverNum}`)
            .setTitle(`Seeding Messages (S${serverNum})`);

        const fields = [
            new TextInputBuilder()
                .setCustomId('announcement_message')
                .setLabel('Announcement Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(seedingDraft.announcement_message || '')),
            new TextInputBuilder()
                .setCustomId('warning_message')
                .setLabel('Warning Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(seedingDraft.warning_message || '')),
            new TextInputBuilder()
                .setCustomId('punish_message')
                .setLabel('Punish Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(seedingDraft.punish_message || '')),
            new TextInputBuilder()
                .setCustomId('kick_message')
                .setLabel('Kick Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(seedingDraft.kick_message || ''))
        ];

        modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
        return modal;
    }

    buildSeedVipMessagesModal(serverNum, seedVipDraft = {}) {
        const modal = new ModalBuilder()
            .setCustomId(`seed_modal_form_seedvip_messages_${serverNum}`)
            .setTitle(`Seed VIP Messages (S${serverNum})`);

        const messages = seedVipDraft.player_messages || {};
        const fields = [
            new TextInputBuilder()
                .setCustomId('seeding_in_progress_message')
                .setLabel('Seeding In Progress Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(messages.seeding_in_progress_message || '')),
            new TextInputBuilder()
                .setCustomId('seeding_complete_message')
                .setLabel('Seeding Complete Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(messages.seeding_complete_message || '')),
            new TextInputBuilder()
                .setCustomId('player_count_message')
                .setLabel('Player Count Message')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(String(messages.player_count_message || '')),
            new TextInputBuilder()
                .setCustomId('reward_player_message')
                .setLabel('Reward Player Message')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(messages.reward_player_message || '')),
            new TextInputBuilder()
                .setCustomId('reward_player_message_no_vip')
                .setLabel('Reward Player Message (No VIP)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setValue(String(messages.reward_player_message_no_vip || ''))
        ];

        modal.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(f)));
        return modal;
    }
}

module.exports = { SeedingPanelService };
