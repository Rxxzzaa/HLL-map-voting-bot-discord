/**
 * Schedule Panel Service
 * Discord UI for managing time-based map pool schedules
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const scheduleManager = require('./scheduleManager');
const automodPresetManager = require('./automodPresetManager');
const logger = require('../utils/logger');

class SchedulePanelService {
    /**
     * Build main schedule management panel
     */
    buildSchedulePanel(serverNum, serverName = 'Server') {
        const config = scheduleManager.getServerConfig(serverNum);
        const schedules = scheduleManager.getSchedules(serverNum);
        const activeSchedule = scheduleManager.getActiveSchedule(serverNum);
        const { time, day, timezone } = scheduleManager.getCurrentTime(serverNum);

        const embed = new EmbedBuilder()
            .setTitle(`⏰ Schedule Manager - ${serverName}`)
            .setColor(0x3498DB)
            .setTimestamp();

        // Current status
        let statusValue = `**Current Time:** ${time} (${day.toUpperCase()})\n`;
        statusValue += `**Timezone:** ${timezone}\n\n`;

        if (activeSchedule.isOverride) {
            statusValue += `**Active:** ${activeSchedule.name} (Override)\n`;
            if (activeSchedule.overrideType === 'match') {
                statusValue += `*Ends after current match*`;
            } else if (activeSchedule.overrideExpiresAt) {
                const expiry = new Date(activeSchedule.overrideExpiresAt);
                statusValue += `*Expires: ${expiry.toLocaleTimeString()}*`;
            }
        } else if (activeSchedule.isDefault) {
            statusValue += `**Active:** Default (All Maps)\n`;
            statusValue += `*No schedule matches current time*`;
        } else {
            statusValue += `**Active:** ${activeSchedule.name}\n`;
            statusValue += `*${activeSchedule.startTime} - ${activeSchedule.endTime}*`;
        }

        embed.addFields({
            name: '📊 Current Status',
            value: statusValue,
            inline: false
        });

        // List schedules
        if (schedules.length > 0) {
            let scheduleList = '';
            for (const schedule of schedules) {
                const display = scheduleManager.formatScheduleDisplay(schedule, serverNum);
                const activeMarker = schedule.id === activeSchedule.id && !activeSchedule.isDefault ? ' 🟢' : '';
                const enabledMarker = display.enabled ? '' : ' (Disabled)';

                scheduleList += `**${schedule.name}**${activeMarker}${enabledMarker}\n`;
                scheduleList += `⏰ ${display.timeRange} | 📅 ${display.days}\n`;
                scheduleList += `👥 Min: ${display.settings?.minimumPlayers || 'Default'} | 🗺️ Maps: ${display.whitelistCount}\n\n`;
            }

            embed.addFields({
                name: `📋 Schedules (${schedules.length})`,
                value: scheduleList.substring(0, 1024) || 'None',
                inline: false
            });
        } else {
            embed.addFields({
                name: '📋 Schedules',
                value: 'No schedules configured.\nClick **Add Schedule** to create one.',
                inline: false
            });
        }

        embed.setDescription(
            'Configure time-based map pools with different settings for different times of day.\n\n' +
            '**How it works:**\n' +
            '• Each schedule defines a time range and days\n' +
            '• Active schedule controls whitelist & settings\n' +
            '• Changes apply after current match ends'
        );

        embed.setFooter({ text: 'Seeding Bot • Schedule Manager' });

        // Buttons Row 1 - Schedule management
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_add_${serverNum}`)
                .setLabel('Add Schedule')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`schedule_edit_${serverNum}`)
                .setLabel('Edit Schedule')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(schedules.length === 0),
            new ButtonBuilder()
                .setCustomId(`schedule_maps_${serverNum}`)
                .setLabel('Manage Maps')
                .setEmoji('🗺️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(schedules.length === 0),
            new ButtonBuilder()
                .setCustomId(`schedule_delete_${serverNum}`)
                .setLabel('Delete')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(schedules.length === 0)
        );

        // Buttons Row 2 - Settings
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_timezone_${serverNum}`)
                .setLabel('Set Timezone')
                .setEmoji('🌍')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`schedule_override_${serverNum}`)
                .setLabel('Override')
                .setEmoji('⚡')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(schedules.length === 0),
            new ButtonBuilder()
                .setCustomId(`schedule_clear_override_${serverNum}`)
                .setLabel('Clear Override')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!config.activeOverride),
            new ButtonBuilder()
                .setCustomId('mapvote_back')
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_automods_${serverNum}`)
                .setLabel('Attach Automods')
                .setEmoji('🤖')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(schedules.length === 0)
        );

        return { embeds: [embed], components: [row1, row2, row3] };
    }

    /**
     * Build timezone selection panel
     */
    buildTimezonePanel(serverNum) {
        const config = scheduleManager.getServerConfig(serverNum);
        const timezones = scheduleManager.getTimezones();

        const embed = new EmbedBuilder()
            .setTitle('🌍 Select Timezone')
            .setDescription(`Current timezone: **${config.timezone}**\n\nSelect your local timezone for schedule times.`)
            .setColor(0x3498DB);

        const options = timezones.map(tz => ({
            label: tz.label,
            description: tz.value,
            value: tz.value,
            default: tz.value === config.timezone
        }));

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_set_timezone_${serverNum}`)
                .setPlaceholder('Select timezone...')
                .addOptions(options)
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_back_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [selectRow, backRow] };
    }

    /**
     * Build schedule selection panel (for edit/delete)
     */
    buildScheduleSelectPanel(serverNum, action) {
        const schedules = scheduleManager.getSchedules(serverNum);

        const embed = new EmbedBuilder()
            .setTitle(`Select Schedule to ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setColor(action === 'delete' ? 0xE74C3C : 0x3498DB);

        if (schedules.length === 0) {
            embed.setDescription('No schedules configured.');
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_back_${serverNum}`)
                    .setLabel('Back')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
            );
            return { embeds: [embed], components: [backRow] };
        }

        const options = schedules.map(schedule => {
            const display = scheduleManager.formatScheduleDisplay(schedule, serverNum);
            return {
                label: schedule.name.substring(0, 100),
                description: `${display.timeRange} | ${display.days}`,
                value: schedule.id
            };
        });

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_select_${action}_${serverNum}`)
                .setPlaceholder(`Select a schedule to ${action}...`)
                .addOptions(options)
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_back_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [selectRow, backRow] };
    }

    /**
     * Build schedule selection for map management
     */
    buildScheduleMapSelectPanel(serverNum) {
        const schedules = scheduleManager.getSchedules(serverNum);

        const embed = new EmbedBuilder()
            .setTitle('🗺️ Select Schedule to Manage Maps')
            .setDescription('Choose which schedule\'s map pool you want to configure.')
            .setColor(0x2ECC71);

        if (schedules.length === 0) {
            embed.setDescription('No schedules configured. Create a schedule first.');
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_back_${serverNum}`)
                    .setLabel('Back')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
            );
            return { embeds: [embed], components: [backRow] };
        }

        const options = schedules.map(schedule => {
            const whitelistInfo = schedule.whitelist === null
                ? 'All Maps'
                : `${schedule.whitelist.length} maps`;
            return {
                label: schedule.name.substring(0, 100),
                description: `${schedule.startTime}-${schedule.endTime} | ${whitelistInfo}`,
                value: schedule.id
            };
        });

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_select_maps_${serverNum}`)
                .setPlaceholder('Select a schedule...')
                .addOptions(options)
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_back_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [selectRow, backRow] };
    }

    /**
     * Build schedule selection for automod profile attachment
     */
    buildScheduleAutomodSelectPanel(serverNum) {
        const schedules = scheduleManager.getSchedules(serverNum);

        const embed = new EmbedBuilder()
            .setTitle('🤖 Select Schedule for Automods')
            .setDescription('Choose which schedule should have saved automod configs attached.')
            .setColor(0x5865F2);

        if (schedules.length === 0) {
            embed.setDescription('No schedules configured. Create a schedule first.');
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_back_${serverNum}`)
                    .setLabel('Back')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
            );
            return { embeds: [embed], components: [backRow] };
        }

        const options = schedules.map(schedule => ({
            label: schedule.name.substring(0, 100),
            description: `${schedule.startTime}-${schedule.endTime}`.substring(0, 100),
            value: schedule.id
        }));

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_select_automods_${serverNum}`)
                .setPlaceholder('Select a schedule...')
                .addOptions(options)
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_back_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [selectRow, backRow] };
    }

    /**
     * Build automod attachment panel for a specific schedule
     */
    buildScheduleAutomodAttachPanel(serverNum, scheduleId) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = schedules.find(item => item.id === scheduleId);
        if (!schedule) {
            return { content: 'Schedule not found.' };
        }

        const attachments = schedule.automodProfiles || {
            level: null,
            no_leader: null,
            solo_tank: null
        };

        const levelPresets = automodPresetManager.getPresets(serverNum, 'level');
        const noLeaderPresets = automodPresetManager.getPresets(serverNum, 'no_leader');
        const soloTankPresets = automodPresetManager.getPresets(serverNum, 'solo_tank');

        const findName = (list, id) => list.find(item => item.id === id)?.displayName || 'None';

        const embed = new EmbedBuilder()
            .setTitle(`🤖 Attach Automods - ${schedule.name}`)
            .setColor(0x5865F2)
            .setDescription(
                'Attach saved automod configs to this schedule.\n' +
                'When the schedule becomes active, attached presets are applied automatically.\n\n' +
                `**Level:** ${findName(levelPresets, attachments.level)}\n` +
                `**No Leader:** ${findName(noLeaderPresets, attachments.no_leader)}\n` +
                `**No Solo Tank:** ${findName(soloTankPresets, attachments.solo_tank)}`
            );

        const withNone = (items, type, attachedId) => {
            const base = [
                {
                    label: `None (${type})`,
                    description: 'Do not apply a preset for this automod',
                    value: 'none'
                }
            ];
            const mapped = items.slice(0, 24).map(item => ({
                label: item.displayName.substring(0, 100),
                description: (item.name || '').substring(0, 100) || 'Saved preset',
                value: item.id,
                default: item.id === attachedId
            }));

            if (attachedId === null || attachedId === undefined) {
                base[0].default = true;
            }
            return [...base, ...mapped];
        };

        const levelRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_attach_level_${serverNum}_${scheduleId}`)
                .setPlaceholder('Attach Level preset...')
                .addOptions(withNone(levelPresets, 'Level', attachments.level))
        );

        const noLeaderRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_attach_no_leader_${serverNum}_${scheduleId}`)
                .setPlaceholder('Attach No Leader preset...')
                .addOptions(withNone(noLeaderPresets, 'No Leader', attachments.no_leader))
        );

        const soloTankRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_attach_solo_tank_${serverNum}_${scheduleId}`)
                .setPlaceholder('Attach No Solo Tank preset...')
                .addOptions(withNone(soloTankPresets, 'No Solo Tank', attachments.solo_tank))
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_automods_${serverNum}`)
                .setLabel('Back to Schedule Select')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [levelRow, noLeaderRow, soloTankRow, backRow] };
    }

    /**
     * Build schedule selection for exporting included maps
     */
    buildScheduleExportSelectPanel(serverNum) {
        const schedules = scheduleManager.getSchedules(serverNum);

        const embed = new EmbedBuilder()
            .setTitle('📤 Export Schedule')
            .setDescription('Select a schedule to export its included maps as a `.txt` file.')
            .setColor(0x3498DB);

        if (schedules.length === 0) {
            embed.setDescription('No schedules configured. Create a schedule first.');
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('mapvote_back')
                    .setLabel('Back')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
            );
            return { embeds: [embed], components: [backRow] };
        }

        const options = schedules.map(schedule => {
            const whitelistInfo = schedule.whitelist === null
                ? 'Using CRCON whitelist'
                : `${schedule.whitelist.length} included maps`;
            return {
                label: schedule.name.substring(0, 100),
                description: `${schedule.startTime}-${schedule.endTime} | ${whitelistInfo}`.substring(0, 100),
                value: schedule.id
            };
        });

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_select_export_${serverNum}`)
                .setPlaceholder('Select a schedule to export...')
                .addOptions(options)
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('mapvote_back')
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [selectRow, backRow] };
    }

    /**
     * Build override selection panel
     */
    buildOverridePanel(serverNum) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const config = scheduleManager.getServerConfig(serverNum);

        const embed = new EmbedBuilder()
            .setTitle('⚡ Override Schedule')
            .setDescription(
                'Temporarily force a specific schedule.\n\n' +
                '**Override Types:**\n' +
                '• **Until Match Ends** - Reverts after current match\n' +
                '• **For X Hours** - Reverts after time expires'
            )
            .setColor(0xF39C12);

        if (config.activeOverride) {
            const currentSchedule = schedules.find(s => s.id === config.activeOverride.scheduleId);
            embed.addFields({
                name: 'Current Override',
                value: `**${currentSchedule?.name || 'Default'}** (${config.activeOverride.type})`,
                inline: false
            });
        }

        // Schedule selection
        const scheduleOptions = [
            { label: 'Default (All Maps)', description: 'Use default settings', value: 'default' },
            ...schedules.map(s => ({
                label: s.name.substring(0, 100),
                description: `${s.startTime} - ${s.endTime}`,
                value: s.id
            }))
        ];

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`schedule_override_select_${serverNum}`)
                .setPlaceholder('Select schedule to activate...')
                .addOptions(scheduleOptions.slice(0, 25))
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_back_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [selectRow, backRow] };
    }

    /**
     * Build override type selection panel
     */
    buildOverrideTypePanel(serverNum, scheduleId) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = scheduleId === 'default'
            ? { name: 'Default (All Maps)' }
            : schedules.find(s => s.id === scheduleId);

        const embed = new EmbedBuilder()
            .setTitle('⚡ Override Duration')
            .setDescription(`Override to: **${schedule?.name || 'Unknown'}**\n\nHow long should this override last?`)
            .setColor(0xF39C12);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_override_match_${serverNum}_${scheduleId}`)
                .setLabel('Until Match Ends')
                .setEmoji('🎮')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`schedule_override_hours_${serverNum}_${scheduleId}`)
                .setLabel('For X Hours')
                .setEmoji('⏱️')
                .setStyle(ButtonStyle.Primary)
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_override_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row, backRow] };
    }

    /**
     * Build add/edit schedule modal
     */
    buildScheduleModal(serverNum, existingSchedule = null) {
        const isEdit = existingSchedule !== null;

        const modal = new ModalBuilder()
            .setCustomId(`schedule_modal_${serverNum}${isEdit ? `_${existingSchedule.id}` : ''}`)
            .setTitle(isEdit ? 'Edit Schedule' : 'Create Schedule');

        const nameInput = new TextInputBuilder()
            .setCustomId('schedule_name')
            .setLabel('Schedule Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Prime Time, Seeding Hours')
            .setValue(existingSchedule?.name || '')
            .setRequired(true)
            .setMaxLength(50);

        const startTimeInput = new TextInputBuilder()
            .setCustomId('schedule_start')
            .setLabel('Start Time (24h format)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 18:00')
            .setValue(existingSchedule?.startTime || '18:00')
            .setRequired(true)
            .setMaxLength(5);

        const endTimeInput = new TextInputBuilder()
            .setCustomId('schedule_end')
            .setLabel('End Time (24h format)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 23:00')
            .setValue(existingSchedule?.endTime || '23:00')
            .setRequired(true)
            .setMaxLength(5);

        const minPlayersInput = new TextInputBuilder()
            .setCustomId('schedule_min_players')
            .setLabel('Minimum Players to Activate')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 40')
            .setValue(String(existingSchedule?.settings?.minimumPlayers || 40))
            .setRequired(true)
            .setMaxLength(3);

        const mapsPerVoteInput = new TextInputBuilder()
            .setCustomId('schedule_maps_per_vote')
            .setLabel('Maps Per Vote')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 6')
            .setValue(String(existingSchedule?.settings?.mapsPerVote || 6))
            .setRequired(true)
            .setMaxLength(2);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(startTimeInput),
            new ActionRowBuilder().addComponents(endTimeInput),
            new ActionRowBuilder().addComponents(minPlayersInput),
            new ActionRowBuilder().addComponents(mapsPerVoteInput)
        );

        return modal;
    }

    /**
     * Build hours input modal for override
     */
    buildOverrideHoursModal(serverNum, scheduleId) {
        const modal = new ModalBuilder()
            .setCustomId(`schedule_override_hours_modal_${serverNum}_${scheduleId}`)
            .setTitle('Override Duration');

        const hoursInput = new TextInputBuilder()
            .setCustomId('hours')
            .setLabel('Duration in hours')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 2')
            .setValue('2')
            .setRequired(true)
            .setMaxLength(2);

        modal.addComponents(
            new ActionRowBuilder().addComponents(hoursInput)
        );

        return modal;
    }

    /**
     * Build day selection panel for a schedule
     */
    buildDaySelectPanel(serverNum, scheduleId) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = schedules.find(s => s.id === scheduleId);

        const embed = new EmbedBuilder()
            .setTitle('📅 Select Days')
            .setDescription(`Schedule: **${schedule?.name || 'Unknown'}**\n\nSelect which days this schedule is active.`)
            .setColor(0x3498DB);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_days_all_${serverNum}_${scheduleId}`)
                .setLabel('All Days')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`schedule_days_weekdays_${serverNum}_${scheduleId}`)
                .setLabel('Weekdays')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`schedule_days_weekend_${serverNum}_${scheduleId}`)
                .setLabel('Weekend')
                .setStyle(ButtonStyle.Secondary)
        );

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`schedule_back_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [row, backRow] };
    }

    /**
     * Build whitelist selection panel for a schedule
     */
    async buildScheduleWhitelistPanel(serverNum, scheduleId, crconService, page = 0, filter = null) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = schedules.find(s => s.id === scheduleId);

        if (!schedule) {
            return { content: 'Schedule not found.' };
        }

        // Get all maps from CRCON
        let allMaps = [];
        try {
            const mapsResponse = await crconService.getMaps();
            allMaps = mapsResponse?.result || [];
        } catch (e) {
            logger.error('[SchedulePanel] Error fetching maps:', e);
        }

        // Get schedule's whitelist (null = use all maps)
        const scheduleWhitelist = new Set(schedule.whitelist || []);
        const useAllMaps = schedule.whitelist === null;

        // Filter maps
        let filteredMaps = allMaps;
        if (filter === 'warfare') {
            filteredMaps = allMaps.filter(m => m.game_mode === 'warfare');
        } else if (filter === 'offensive') {
            filteredMaps = allMaps.filter(m => m.game_mode === 'offensive');
        } else if (filter === 'skirmish') {
            filteredMaps = allMaps.filter(m => m.game_mode === 'skirmish');
        } else if (filter === 'night') {
            filteredMaps = allMaps.filter(m => m.environment === 'night');
        } else if (filter === 'day') {
            filteredMaps = allMaps.filter(m => m.environment !== 'night');
        }

        // Paginate
        const mapsPerPage = 12;
        const totalPages = Math.ceil(filteredMaps.length / mapsPerPage);
        const startIndex = page * mapsPerPage;
        const pageMaps = filteredMaps.slice(startIndex, startIndex + mapsPerPage);

        // Build map list
        const mapLines = pageMaps.map(map => {
            const isIncluded = useAllMaps || scheduleWhitelist.has(map.id);
            const icon = isIncluded ? '✅' : '❌';
            const mode = map.game_mode === 'warfare' ? '⚔️' : map.game_mode === 'offensive' ? '🎯' : '🔫';
            const time = map.environment === 'night' ? '🌙' : map.environment === 'day' ? '☀️' : '🌤️';
            return `${icon} ${mode}${time} ${map.pretty_name || map.id}`;
        });

        const embed = new EmbedBuilder()
            .setTitle(`🗺️ Schedule Whitelist - ${schedule.name}`)
            .setDescription(
                (useAllMaps
                    ? '**Mode:** Using ALL maps from CRCON whitelist\n\n'
                    : `**Mode:** Custom whitelist (${scheduleWhitelist.size} maps)\n\n`) +
                `**Legend:** ✅ = Included, ❌ = Excluded\n` +
                `**Modes:** ⚔️ Warfare, 🎯 Offensive, 🔫 Skirmish\n` +
                `**Time:** ☀️ Day, 🌤️ Overcast, 🌙 Night\n\n` +
                `Page ${page + 1}/${totalPages}\n\n` +
                (mapLines.join('\n') || 'No maps found')
            )
            .setColor(0x2ECC71)
            .setFooter({ text: 'Select maps to include in this schedule\'s rotation' });

        // Mode toggle row
        const modeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`sched_wl_useall_${serverNum}_${scheduleId}`)
                .setLabel('Use All Maps')
                .setEmoji('🌐')
                .setStyle(useAllMaps ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`sched_wl_custom_${serverNum}_${scheduleId}`)
                .setLabel('Custom Selection')
                .setEmoji('✏️')
                .setStyle(!useAllMaps ? ButtonStyle.Success : ButtonStyle.Secondary)
        );

        // Filter row
        const filterRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`sched_wl_filter_${serverNum}_${scheduleId}_all_${page}`)
                .setLabel('All')
                .setStyle(filter === null ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`sched_wl_filter_${serverNum}_${scheduleId}_warfare_${page}`)
                .setLabel('Warfare')
                .setEmoji('⚔️')
                .setStyle(filter === 'warfare' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`sched_wl_filter_${serverNum}_${scheduleId}_offensive_${page}`)
                .setLabel('Offensive')
                .setEmoji('🎯')
                .setStyle(filter === 'offensive' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`sched_wl_filter_${serverNum}_${scheduleId}_skirmish_${page}`)
                .setLabel('Skirmish')
                .setEmoji('🔫')
                .setStyle(filter === 'skirmish' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`sched_wl_filter_${serverNum}_${scheduleId}_night_${page}`)
                .setLabel('Night')
                .setEmoji('🌙')
                .setStyle(filter === 'night' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );

        // Map selection (only if custom mode)
        const components = [modeRow, filterRow];

        if (!useAllMaps && pageMaps.length > 0) {
            const selectOptions = pageMaps.slice(0, 25).map(map => ({
                label: (map.pretty_name || map.id).substring(0, 100),
                value: map.id,
                description: `${scheduleWhitelist.has(map.id) ? '✅ Included' : '❌ Excluded'} - ${map.game_mode}`,
                emoji: scheduleWhitelist.has(map.id) ? '✅' : '❌'
            }));

            const selectRow = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`sched_wl_toggle_${serverNum}_${scheduleId}`)
                    .setPlaceholder('Toggle maps...')
                    .setMinValues(1)
                    .setMaxValues(Math.min(selectOptions.length, 10))
                    .addOptions(selectOptions)
            );
            components.push(selectRow);
        }

        // Navigation row
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`sched_wl_prev_${serverNum}_${scheduleId}_${page}_${filter || 'all'}`)
                .setLabel('◀ Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`sched_wl_next_${serverNum}_${scheduleId}_${page}_${filter || 'all'}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1),
            new ButtonBuilder()
                .setCustomId(`schedule_back_${serverNum}`)
                .setLabel('Back')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
        );
        components.push(navRow);

        // Quick actions (only if custom mode)
        if (!useAllMaps) {
            const quickRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`sched_wl_add_all_${serverNum}_${scheduleId}_${filter || 'all'}`)
                    .setLabel('Add All' + (filter ? ` ${filter}` : ''))
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`sched_wl_remove_all_${serverNum}_${scheduleId}_${filter || 'all'}`)
                    .setLabel('Remove All' + (filter ? ` ${filter}` : ''))
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Danger)
            );
            components.push(quickRow);
        }

        return { embeds: [embed], components: components.slice(0, 5) }; // Discord max 5 rows
    }

    /**
     * Toggle maps in schedule whitelist
     */
    toggleScheduleWhitelistMaps(serverNum, scheduleId, mapIds, allMaps) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = schedules.find(s => s.id === scheduleId);

        if (!schedule) {
            return { success: false, error: 'Schedule not found' };
        }

        // Initialize whitelist if null (was using all maps)
        let whitelist = schedule.whitelist ? [...schedule.whitelist] : allMaps.map(m => m.id);

        for (const mapId of mapIds) {
            const index = whitelist.indexOf(mapId);
            if (index > -1) {
                // Remove
                whitelist.splice(index, 1);
            } else {
                // Add
                whitelist.push(mapId);
            }
        }

        scheduleManager.updateSchedule(serverNum, scheduleId, { whitelist });
        return { success: true, count: whitelist.length };
    }

    /**
     * Set schedule to use all maps (null whitelist)
     */
    setScheduleUseAllMaps(serverNum, scheduleId) {
        return scheduleManager.updateSchedule(serverNum, scheduleId, { whitelist: null });
    }

    /**
     * Set schedule to custom whitelist mode (initialize with all maps)
     */
    async initScheduleCustomWhitelist(serverNum, scheduleId, crconService) {
        let allMaps = [];
        try {
            const mapsResponse = await crconService.getMaps();
            allMaps = (mapsResponse?.result || []).map(m => m.id);
        } catch (e) {
            logger.error('[SchedulePanel] Error fetching maps:', e);
        }

        return scheduleManager.updateSchedule(serverNum, scheduleId, { whitelist: allMaps });
    }

    /**
     * Add all maps matching filter to schedule whitelist
     */
    addAllMapsToSchedule(serverNum, scheduleId, allMaps, filter = null) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = schedules.find(s => s.id === scheduleId);

        if (!schedule) {
            return { success: false, error: 'Schedule not found' };
        }

        let whitelist = schedule.whitelist ? [...schedule.whitelist] : [];

        let mapsToAdd = allMaps;
        if (filter === 'warfare') {
            mapsToAdd = allMaps.filter(m => m.game_mode === 'warfare');
        } else if (filter === 'offensive') {
            mapsToAdd = allMaps.filter(m => m.game_mode === 'offensive');
        } else if (filter === 'skirmish') {
            mapsToAdd = allMaps.filter(m => m.game_mode === 'skirmish');
        } else if (filter === 'night') {
            mapsToAdd = allMaps.filter(m => m.environment === 'night');
        } else if (filter === 'day') {
            mapsToAdd = allMaps.filter(m => m.environment !== 'night');
        }

        for (const map of mapsToAdd) {
            if (!whitelist.includes(map.id)) {
                whitelist.push(map.id);
            }
        }

        scheduleManager.updateSchedule(serverNum, scheduleId, { whitelist });
        return { success: true, count: whitelist.length };
    }

    /**
     * Remove all maps matching filter from schedule whitelist
     */
    removeAllMapsFromSchedule(serverNum, scheduleId, allMaps, filter = null) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = schedules.find(s => s.id === scheduleId);

        if (!schedule) {
            return { success: false, error: 'Schedule not found' };
        }

        let whitelist = schedule.whitelist ? [...schedule.whitelist] : allMaps.map(m => m.id);

        let mapsToRemove = allMaps;
        if (filter === 'warfare') {
            mapsToRemove = allMaps.filter(m => m.game_mode === 'warfare');
        } else if (filter === 'offensive') {
            mapsToRemove = allMaps.filter(m => m.game_mode === 'offensive');
        } else if (filter === 'skirmish') {
            mapsToRemove = allMaps.filter(m => m.game_mode === 'skirmish');
        } else if (filter === 'night') {
            mapsToRemove = allMaps.filter(m => m.environment === 'night');
        } else if (filter === 'day') {
            mapsToRemove = allMaps.filter(m => m.environment !== 'night');
        }

        const removeIds = new Set(mapsToRemove.map(m => m.id));
        whitelist = whitelist.filter(id => !removeIds.has(id));

        scheduleManager.updateSchedule(serverNum, scheduleId, { whitelist });
        return { success: true, count: whitelist.length };
    }

    /**
     * Process schedule modal submission
     */
    processScheduleModal(interaction, serverNum, scheduleId = null) {
        const name = interaction.fields.getTextInputValue('schedule_name');
        const startTime = interaction.fields.getTextInputValue('schedule_start');
        const endTime = interaction.fields.getTextInputValue('schedule_end');
        const minPlayers = parseInt(interaction.fields.getTextInputValue('schedule_min_players'));
        const mapsPerVote = parseInt(interaction.fields.getTextInputValue('schedule_maps_per_vote'));

        // Validate time format
        const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return { success: false, error: 'Invalid time format. Use HH:MM (24-hour format).' };
        }

        // Validate numbers
        if (isNaN(minPlayers) || minPlayers < 0 || minPlayers > 100) {
            return { success: false, error: 'Minimum players must be between 0 and 100.' };
        }
        if (isNaN(mapsPerVote) || mapsPerVote < 2 || mapsPerVote > 10) {
            return { success: false, error: 'Maps per vote must be between 2 and 10.' };
        }

        const scheduleData = {
            name,
            startTime,
            endTime,
            minimumPlayers: minPlayers,
            mapsPerVote
        };

        if (scheduleId) {
            // Update existing
            const result = scheduleManager.updateSchedule(serverNum, scheduleId, {
                name: scheduleData.name,
                startTime: scheduleData.startTime,
                endTime: scheduleData.endTime,
                settings: {
                    minimumPlayers: scheduleData.minimumPlayers,
                    mapsPerVote: scheduleData.mapsPerVote
                }
            });
            return result;
        } else {
            // Create new
            const schedule = scheduleManager.createSchedule(serverNum, scheduleData);
            return { success: true, schedule, isNew: true };
        }
    }

    /**
     * Build schedule map export content
     */
    async buildScheduleExport(serverNum, scheduleId, crconService, serverName = null) {
        const schedules = scheduleManager.getSchedules(serverNum);
        const schedule = schedules.find(s => s.id === scheduleId);

        if (!schedule) {
            return { success: false, error: 'Schedule not found' };
        }

        let allMaps = [];
        try {
            const mapsResponse = await crconService.getMaps();
            allMaps = mapsResponse?.result || [];
        } catch (e) {
            logger.error('[SchedulePanel] Error fetching maps for export:', e);
        }

        const mapById = new Map(allMaps.map(map => [map.id, map]));

        let includedMapIds = [];
        let sourceMode = 'Custom schedule whitelist';

        if (schedule.whitelist === null) {
            sourceMode = 'CRCON whitelist (Use All Maps mode)';
            try {
                const whitelistResponse = await crconService.getVotemapWhitelist();
                includedMapIds = whitelistResponse?.result || [];
            } catch (e) {
                logger.error('[SchedulePanel] Error fetching CRCON whitelist for export:', e);
                includedMapIds = [];
            }
        } else {
            includedMapIds = Array.isArray(schedule.whitelist) ? schedule.whitelist : [];
        }

        const uniqueMapIds = [...new Set(includedMapIds)];
        const lines = uniqueMapIds.map((mapId, index) => {
            const map = mapById.get(mapId);
            const displayName = map?.pretty_name || map?.name || mapId;
            const mode = map?.game_mode || 'unknown';
            const environment = map?.environment || 'unknown';
            return `${index + 1}. ${displayName} [${mapId}] (${mode}, ${environment})`;
        });

        const exportedAt = new Date().toISOString();
        const safeName = (schedule.name || 'schedule')
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 40) || 'schedule';
        const filename = `schedule-export-s${serverNum}-${safeName}.txt`;

        const contentLines = [
            'Schedule Export',
            '====================',
            `Server: ${serverName || `Server ${serverNum}`}`,
            `Schedule: ${schedule.name}`,
            `Schedule ID: ${schedule.id}`,
            `Time Range: ${schedule.startTime} - ${schedule.endTime}`,
            `Days: ${(schedule.days || []).join(', ') || 'all'}`,
            `Source: ${sourceMode}`,
            `Exported At (UTC): ${exportedAt}`,
            '',
            `Included Maps (${uniqueMapIds.length}):`,
            ...(
                lines.length > 0
                    ? lines
                    : ['(No maps included)']
            ),
            ''
        ];

        return {
            success: true,
            filename,
            content: contentLines.join('\n'),
            mapCount: uniqueMapIds.length,
            scheduleName: schedule.name
        };
    }
}

module.exports = new SchedulePanelService();

