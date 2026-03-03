import { chat_metadata, getRequestHeaders } from '../../../../../script.js';
import { getContext, saveMetadataDebounced } from '../../../../extensions.js';
import { delay } from '../../../../utils.js';
import { quickReplyApi } from '../../../quick-reply/index.js';
import { groupId } from '../index.js';
import { ActionSetting } from './settings/ActionSetting.js';
import { BaseSetting } from './settings/BaseSetting.js';
import { CheckboxSetting } from './settings/CheckboxSetting.js';
import { ColorSetting } from './settings/ColorSetting.js';
import { CustomSetting } from './settings/CustomSetting.js';
import { SelectSetting } from './settings/SelectSetting.js';
import { SettingAction } from './settings/SettingAction.js';
import { TextSetting } from './settings/TextSetting.js';

export class Settings {
    static EXTENSION_KEY = 'trigger_cards';

    /**@type {boolean} */ isEnabled = groupId ? true : false;
    /**@type {string} */ actionQrSet = null;
    /**@type {string} */ memberQrSet = null;
    /**@type {string[]} */ memberList = null;
    /**@type {string} */ expression = '';
    /**@type {string[]} */ extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];
    /**@type {boolean} */ grayscale = true;
    /**@type {boolean} */ mute = true;
    /**@type {boolean} */ isCollapsed = false;
    /**@type {boolean} */ startCollapsed = false;
    /**@type {{[index:string]:string}} */ costumes = {};
    /**@type {'left'|'center'|'right'} */ align = 'center';
    /**@type {'square'|'circle'} */ imageShape = 'square';
    /**@type {'solid'|'transparent'} */ backgroundMode = 'solid';
    /**@type {string} */ backgroundColor = '#00000059';
    /**@type {number} */ imageHeightPx = 94;
    /**@type {boolean} */ antiAlias = true;
    /**@type {'auto'|'1 / 1'|'2 / 3'|'3 / 4'|'16 / 9'} */ cardAspectRatio = 'auto';
    /**@type {number} */ cardGapPx = 6;
    /**@type {boolean} */ showOutline = false;
    /**@type {string} */ outlineColor = '#ffffff66';
    /**@type {boolean} */ showDropShadow = true;
    /**@type {string} */ shadowColor = '#00000080';
    /**@type {boolean} */ hoverAnimation = true;
    /**@type {boolean} */ showActionsSection = false;
    /**@type {boolean} */ showMembersSection = false;
    /**@type {'trigger'|'trigger_cancel'} */ clickBehavior = 'trigger_cancel';
    /**@type {boolean} */ rightClickMute = true;
    /**@type {boolean} */ showReplyModeShortcut = false;
    /**@type {boolean} */ showGenerationModeShortcut = false;
    /**@type {boolean} */ enableDragReorder = false;
    /**@type {boolean} */ showNametags = false;
    /**@type {'above'|'below'} */ nametagPosition = 'below';
    /**@type {string} */ nametagColor = '#ffffff';
    /**@type {number} */ nametagOpacity = 0.9;
    /**@type {number} */ nametagSizePx = 11;
    /**@type {boolean} */ nametagShadow = true;
    /**@type {'sprite'|'gallery'|'expressions'|'avatar'} */ defaultImageSource = 'avatar';
    /**@type {string|null} */ spriteManagerCardKey = null;

    /**@type {BaseSetting[]}*/ settingList = [];
    /** @type {string | null} */ spriteManagerCharacter = null;
    /** @type {string[]} */ manualOrder = [];
    get isActive() {
        return this.dom.classList.contains('sttc--active');
    }


    /**@type {()=>void} */ onRestart;
    /**@type {()=>void} */ onShow;
    /**@type {()=>void} */ onHide;


    /**@type {HTMLElement}*/ dom;
    /**@type {HTMLElement}*/ parent;

    constructor() {
        Object.assign(this, chat_metadata.triggerCards ?? {});
        if (typeof this.imageHeightPx !== 'number') {
            this.imageHeightPx = Math.max(48, Math.round((Number(this.imageHeightVh) || 10) * 9.4));
        }
        this.registerSettings();
        this.init();
    }

    toJSON() {
        return {
            isEnabled: this.isEnabled,
            actionQrSet: this.actionQrSet,
            memberQrSet: this.memberQrSet,
            memberList: this.memberList,
            expression: this.expression,
            extensions: this.extensions,
            grayscale: this.grayscale,
            mute: this.mute,
            isCollapsed: this.isCollapsed,
            startCollapsed: this.startCollapsed,
            costumes: this.costumes,
            align: this.align,
            imageShape: this.imageShape,
            backgroundMode: this.backgroundMode,
            backgroundColor: this.backgroundColor,
            imageHeightPx: this.imageHeightPx,
            antiAlias: this.antiAlias,
            cardAspectRatio: this.cardAspectRatio,
            cardGapPx: this.cardGapPx,
            showOutline: this.showOutline,
            outlineColor: this.outlineColor,
            showDropShadow: this.showDropShadow,
            shadowColor: this.shadowColor,
            hoverAnimation: this.hoverAnimation,
            showActionsSection: this.showActionsSection,
            showMembersSection: this.showMembersSection,
            clickBehavior: this.clickBehavior,
            rightClickMute: this.rightClickMute,
            showReplyModeShortcut: this.showReplyModeShortcut,
            showGenerationModeShortcut: this.showGenerationModeShortcut,
            enableDragReorder: this.enableDragReorder,
            showNametags: this.showNametags,
            nametagPosition: this.nametagPosition,
            nametagColor: this.nametagColor,
            nametagOpacity: this.nametagOpacity,
            nametagSizePx: this.nametagSizePx,
            nametagShadow: this.nametagShadow,
            defaultImageSource: this.defaultImageSource,
            manualOrder: this.manualOrder,
        };
    }

    load() {
        Object.assign(this, chat_metadata.triggerCards ?? {});
    }

    async rebuildActiveUi() {
        const wasActive = this.isActive;
        const parent = this.parent ?? document.body;
        if (wasActive) this.hide();
        this.registerSettings();
        await this.init();
        if (wasActive) await this.show(parent);
    }


    registerSettings() {
        while (this.settingList.pop());
        { // general
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--isEnabled',
                name: 'Enable Trigger Cards',
                description: 'Uncheck to disable Trigger Cards in this chat.',
                category: ['General'],
                initialValue: this.isEnabled,
                onChange: (it)=>{
                    this.isEnabled = it.value;
                    this.save(true);
                },
            }));
            this.settingList.push(ActionSetting.fromProps({ id: 'sttc--reset',
                name: 'Reset Settings',
                description: 'Reset all settings for this chat.',
                category: ['General'],
                initialValue: null,
                actionList: [
                    SettingAction.fromProps({ label: 'Reset',
                        icon: 'fa-rotate',
                        tooltip: 'Reset all settings for this chat',
                        action: async()=>{
                            this.hide();
                            Object.assign(this, {
                                isEnabled: groupId ? true : false,
                                actionQrSet: null,
                                memberQrSet: null,
                                memberList: null,
                                expression: '',
                                extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'],
                                grayscale: true,
                                mute: true,
                                isCollapsed: false,
                                startCollapsed: false,
                                costumes: {},
                                align: 'center',
                                imageShape: 'square',
                                backgroundMode: 'solid',
                                backgroundColor: '#00000059',
                                imageHeightPx: 94,
                                antiAlias: true,
                                cardAspectRatio: 'auto',
                                cardGapPx: 6,
                                showOutline: false,
                                outlineColor: '#ffffff66',
                                showDropShadow: true,
                                shadowColor: '#00000080',
                                hoverAnimation: true,
                                showActionsSection: false,
                                showMembersSection: false,
                                clickBehavior: 'trigger_cancel',
                                rightClickMute: true,
                                showReplyModeShortcut: false,
                                showGenerationModeShortcut: false,
                                enableDragReorder: false,
                                showNametags: false,
                                nametagPosition: 'below',
                                nametagColor: '#ffffff',
                                nametagOpacity: 0.9,
                                nametagSizePx: 11,
                                nametagShadow: true,
                                defaultImageSource: 'avatar',
                                manualOrder: [],
                            });
                            this.registerSettings();
                            await this.init();
                            this.show();
                            this.save(true);
                        },
                    }),
                ],
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--showActionsSection',
                name: 'Show Actions Settings (Advanced)',
                description: 'Enable advanced Actions settings section.',
                category: ['General'],
                initialValue: this.showActionsSection,
                onChange: (it)=>{
                    this.showActionsSection = it.value;
                    this.save();
                    this.rebuildActiveUi();
                },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--showMembersSection',
                name: 'Show Members Settings (Advanced)',
                description: 'Enable advanced Members settings section.',
                category: ['General'],
                initialValue: this.showMembersSection,
                onChange: (it)=>{
                    this.showMembersSection = it.value;
                    this.save();
                    this.rebuildActiveUi();
                },
            }));
            this.settingList.push(ActionSetting.fromProps({ id: 'sttc--manageSpritesQuick',
                name: 'Manage Sprites',
                description: 'Jump directly to the Images > Sprite Manager section.',
                category: ['General'],
                initialValue: null,
                actionList: [
                    SettingAction.fromProps({ label: 'Open Sprite Manager', icon: 'fa-images', tooltip: 'Jump to sprite manager', action: ()=>{
                        const head = this.dom?.querySelector('.contentWrapper > .category > .head[data-key="images"]');
                        head?.scrollIntoView({ behavior:'smooth', block:'start' });
                    }}),
                ],
            }));
        }
        if (this.showActionsSection) { // actions
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--actionQrSet',
                name: 'Click Actions',
                description: 'Name of a QR Set for click actions, see /tc?',
                category: ['Actions'],
                initialValue: this.actionQrSet,
                optionList: [{ value:'', label:'-- Default Actions --' }, ...quickReplyApi.listSets().map(it=>({ value:it, label:it }))],
                onChange: (it)=>{
                    this.actionQrSet = it.value;
                    this.save();
                },
            }));
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--clickBehavior',
                name: 'Click Behavior',
                description: 'Click to trigger; optional second click can cancel while streaming.',
                category: ['Actions'],
                initialValue: this.clickBehavior,
                optionList: [
                    { value:'trigger', label:'Trigger only' },
                    { value:'trigger_cancel', label:'Trigger then cancel on second click' },
                ],
                onChange: (it)=>{ this.clickBehavior = it.value; this.save(); },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--rightClickMute',
                name: 'Right-click toggles mute',
                description: 'Use right click on a card to mute/unmute that character.',
                category: ['Actions'],
                initialValue: this.rightClickMute,
                onChange: (it)=>{ this.rightClickMute = it.value; this.save(); },
            }));
        }
        if (this.showMembersSection) { // members
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--memberQrSet',
                name: 'Member QR Set',
                description: 'Name of a QR Set used as member list, see /tc?',
                category: ['Members'],
                initialValue: this.memberQrSet,
                optionList: [{ value:'', label:'-- None --' }, ...quickReplyApi.listSets().map(it=>({ value:it, label:it }))],
                onChange: (it)=>{
                    this.memberQrSet = it.value;
                    this.save();
                },
            }));
            this.settingList.push(TextSetting.fromProps({ id: 'sttc--memberList',
                name: 'Member List',
                description: 'Comma separated list of names to use as member list.',
                category: ['Members'],
                initialValue: (this.memberList ?? []).join(', '),
                onChange: (it)=>{
                    this.memberList = it.value.split(/\s*,\s*/)?.filter(it=>it);
                    this.save();
                },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--dragReorder',
                name: 'Enable Drag Reorder',
                description: 'Drag cards to reorder group member response order.',
                category: ['Members'],
                initialValue: this.enableDragReorder,
                onChange: (it)=>{ this.enableDragReorder = it.value; this.save(); },
            }));
        }
        { // images
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--expression',
                name: 'Expressions',
                description: 'Character expression to use for trigger card (set to Disabled to skip expression lookup).',
                category: ['Images'],
                initialValue: this.expression,
                optionList: [
                    '',
                    'admiration',
                    'amusement',
                    'anger',
                    'annoyance',
                    'approval',
                    'caring',
                    'confusion',
                    'curiosity',
                    'desire',
                    'disappointment',
                    'disapproval',
                    'disgust',
                    'embarrassment',
                    'excitement',
                    'fear',
                    'gratitude',
                    'grief',
                    'joy',
                    'love',
                    'nervousness',
                    'optimism',
                    'pride',
                    'realization',
                    'relief',
                    'remorse',
                    'sadness',
                    'surprise',
                    'neutral',
                ].map(it=>({ value:it, label: it || '-- Disabled --' })),
                onChange: (it)=>{
                    this.expression = it.value;
                    this.save();
                },
            }));
            this.settingList.push(TextSetting.fromProps({ id: 'sttc--extensions',
                name: 'Extensions',
                description: 'Comma separated list of image file extensions (png, jpg, jpeg, webp, gif, bmp, avif).',
                category: ['Images'],
                initialValue: (this.extensions ?? []).join(', '),
                onChange: (it)=>{
                    this.extensions = it.value.split(/\s*,\s*/)?.filter(it=>it);
                    this.save();
                },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--grayscale',
                name: 'Absent Grayscale',
                description: 'Show absent members desaturated.',
                category: ['Images'],
                initialValue: this.grayscale,
                onChange: (it)=>{
                    this.grayscale = it.value;
                    this.save();
                },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--mute',
                name: 'Muted Contrast Mode',
                description: 'Muted members become grayscale + lower opacity for clearer distinction.',
                category: ['Images'],
                initialValue: this.mute,
                onChange: (it)=>{
                    this.mute = it.value;
                    this.save();
                },
            }));
        }
        { // layout
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--collapsed',
                name: 'Start Collapsed',
                description: 'Collapse the Trigger Cards bar to a small tab in this chat.',
                category: ['Layout'],
                initialValue: this.startCollapsed,
                onChange: (it)=>{
                    this.startCollapsed = it.value;
                    this.save();
                },
            }));
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--align',
                name: 'Card Alignment',
                description: 'Horizontal placement of Trigger Cards tray.',
                category: ['Layout'],
                initialValue: this.align,
                optionList: [
                    { value:'left', label:'Left' },
                    { value:'center', label:'Center' },
                    { value:'right', label:'Right' },
                ],
                onChange: (it)=>{
                    this.align = it.value;
                    this.save();
                },
            }));
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--shape',
                name: 'Image Shape',
                description: 'Shape outline for Trigger Cards images.',
                category: ['Layout'],
                initialValue: this.imageShape,
                optionList: [
                    { value:'square', label:'Square' },
                    { value:'circle', label:'Circle' },
                ],
                onChange: (it)=>{
                    this.imageShape = it.value;
                    this.save();
                },
            }));
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--bgmode',
                name: 'Background Mode',
                description: 'Tray background mode.',
                category: ['Layout'],
                initialValue: this.backgroundMode,
                optionList: [
                    { value:'solid', label:'Solid' },
                    { value:'transparent', label:'Transparent' },
                ],
                onChange: (it)=>{
                    this.backgroundMode = it.value;
                    this.save();
                },
            }));
            this.settingList.push(ColorSetting.fromProps({ id: 'sttc--bgcolor',
                name: 'Background Color',
                description: 'Solid background color used when background mode is solid.',
                category: ['Layout'],
                initialValue: this.backgroundColor,
                onChange: (it)=>{
                    this.backgroundColor = it.value;
                    this.save();
                },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--antialias',
                name: 'Anti-alias Images',
                description: 'Disable for pixel-art style rendering.',
                category: ['Layout'],
                initialValue: this.antiAlias,
                onChange: (it)=>{
                    this.antiAlias = it.value;
                    this.save();
                },
            }));
            this.settingList.push(CustomSetting.fromProps({
                id: 'sttc--cardGap',
                name: 'Card Gap (px)',
                description: 'Distance between cards in tray.',
                category: ['Layout'],
                renderCallback: () => this.renderRangeControl(0, 48, 1, this.cardGapPx, (v)=>{ this.cardGapPx = v; this.save(); }),
                getValueCallback: () => this.cardGapPx,
                setValueCallback: (value) => { this.cardGapPx = value; },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--outline',
                name: 'Card Outline',
                description: 'Show a border around card images.',
                category: ['Layout'],
                initialValue: this.showOutline,
                onChange: (it)=>{ this.showOutline = it.value; this.save(); },
            }));
            this.settingList.push(ColorSetting.fromProps({ id: 'sttc--outlineColor',
                name: 'Outline Color',
                description: 'Border color including transparency.',
                category: ['Layout'],
                initialValue: this.outlineColor,
                onChange: (it)=>{ this.outlineColor = it.value; this.save(); },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--dropShadow',
                name: 'Drop Shadow',
                description: 'Show drop shadow under cards.',
                category: ['Layout'],
                initialValue: this.showDropShadow,
                onChange: (it)=>{ this.showDropShadow = it.value; this.save(); },
            }));
            this.settingList.push(ColorSetting.fromProps({ id: 'sttc--shadowColor',
                name: 'Shadow Color',
                description: 'Shadow color including transparency.',
                category: ['Layout'],
                initialValue: this.shadowColor,
                onChange: (it)=>{ this.shadowColor = it.value; this.save(); },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--hoverAnimation',
                name: 'Hover Animation',
                description: 'Enable card lift animation on hover.',
                category: ['Layout'],
                initialValue: this.hoverAnimation,
                onChange: (it)=>{ this.hoverAnimation = it.value; this.save(); },
            }));
            this.settingList.push(CheckboxSetting.fromProps({ id: 'sttc--showNametags',
                name: 'Show Nametags',
                description: 'Display character name labels on cards.',
                category: ['Layout'],
                initialValue: this.showNametags,
                onChange: (it)=>{ this.showNametags = it.value; this.save(); },
            }));
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--nametagPosition',
                name: 'Nametag Position',
                description: 'Place nametag above or below card.',
                category: ['Layout'],
                initialValue: this.nametagPosition,
                optionList: [{value:'above',label:'Above'},{value:'below',label:'Below'}],
                onChange: (it)=>{ this.nametagPosition = it.value; this.save(); },
            }));
            this.settingList.push(ColorSetting.fromProps({ id: 'sttc--nametagColor',
                name: 'Nametag Color',
                description: 'Nametag text color.',
                category: ['Layout'],
                initialValue: this.nametagColor,
                onChange: (it)=>{ this.nametagColor = it.value; this.save(); },
            }));
            this.settingList.push(CustomSetting.fromProps({
                id: 'sttc--nametagSize',
                name: 'Nametag Size (px)',
                description: 'Text size for nametags.',
                category: ['Layout'],
                renderCallback: () => this.renderRangeControl(8, 24, 1, this.nametagSizePx, (v)=>{ this.nametagSizePx = v; this.save(); }),
                getValueCallback: () => this.nametagSizePx,
                setValueCallback: (value) => { this.nametagSizePx = value; },
            }));
            this.settingList.push(CustomSetting.fromProps({
                id: 'sttc--nametagOpacity',
                name: 'Nametag Opacity',
                description: 'Opacity for nametag text.',
                category: ['Layout'],
                renderCallback: () => this.renderRangeControl(0, 1, 0.05, this.nametagOpacity, (v)=>{ this.nametagOpacity = v; this.save(); }),
                getValueCallback: () => this.nametagOpacity,
                setValueCallback: (value) => { this.nametagOpacity = value; },
            }));
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--aspect',
                name: 'Card Aspect Ratio',
                description: 'Controls card frame ratio while keeping image height setting.',
                category: ['Layout'],
                initialValue: this.cardAspectRatio,
                optionList: [
                    { value:'auto', label:'Auto' },
                    { value:'1 / 1', label:'1:1 (Square)' },
                    { value:'2 / 3', label:'2:3 (Portrait)' },
                    { value:'3 / 4', label:'3:4 (Portrait)' },
                    { value:'16 / 9', label:'16:9 (Wide)' },
                ],
                onChange: (it)=>{
                    this.cardAspectRatio = it.value;
                    this.save();
                },
            }));
            this.settingList.push(CustomSetting.fromProps({
                id: 'sttc--scale',
                name: 'Image Height (px)',
                description: 'Set image height with slider + input (px).',
                category: ['Layout'],
                renderCallback: () => this.renderImageScaleControl(),
                getValueCallback: () => this.imageHeightPx,
                setValueCallback: (value) => { this.imageHeightPx = value; },
            }));
        }
        { // sprite manager
            this.settingList.push(CustomSetting.fromProps({
                id: 'sttc--spriteManager',
                name: 'Sprite Manager',
                description: 'Manage Trigger Cards custom sprites stored in the selected character sprite folder.',
                category: ['Images'],
                renderCallback: () => this.renderSpriteManager(),
                getValueCallback: () => null,
                setValueCallback: () => null,
            }));
        }
    }

    safeKey(cardKey) {
        const normalized = String(cardKey ?? '')
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]/g, '');

        if (normalized) return normalized;

        let hash = 0;
        const source = String(cardKey ?? '');
        for (let i = 0; i < source.length; i++) {
            hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
        }
        return `key_${hash.toString(16).padStart(8, '0')}`;
    }

    getCardEntries() {
        if (this.memberList?.length) return this.memberList;
        if (this.memberQrSet) {
            try {
                return quickReplyApi.listQuickReplies(this.memberQrSet);
            } catch {
                return [];
            }
        }
        const context = getContext();
        if (groupId) {
            const group = context.groups.find(it => it.id == groupId);
            if (!group) return [];
            return group.members
                .map(m => context.characters.find(c => c.avatar == m)?.name)
                .filter(Boolean);
        }
        return [context.characters[context.characterId]?.name].filter(Boolean);
    }

    getCardEntriesForCharacter(characterName, overrides = {}) {
        const allEntries = this.getCardEntries();
        const matchingEntries = allEntries.filter((entry) => {
            const baseName = String(entry).split('::')[0];
            return baseName === characterName;
        });

        const overrideEntries = Object.keys(overrides);
        const merged = new Set([...matchingEntries, ...overrideEntries]);

        if (merged.size === 0 && characterName) {
            merged.add(characterName);
        }

        return [...merged];
    }

    getCostumeFoldersForCharacter(characterName) {
        const values = Object.values(this.costumes ?? {});
        return [...new Set(values.filter(folder => String(folder).startsWith(`${characterName}/`)))];
    }

    getFolderTargetsForCard(characterName, cardKey, selectedFolder = null) {
        const targets = [];
        if (selectedFolder) targets.push(selectedFolder);
        const mapped = this.costumes?.[cardKey];
        if (mapped && !targets.includes(mapped)) targets.push(mapped);
        if (!targets.includes(characterName)) targets.push(characterName);
        return targets;
    }

    getCharacterExtensions(characterName) {
        const context = getContext();
        const character = context.characters.find(c => c?.name === characterName);
        return character?.data?.extensions?.[Settings.EXTENSION_KEY] ?? {};
    }

    async saveCharacterExtensions(characterName, extensionData) {
        const context = getContext();
        const charIndex = context.characters.findIndex(c => c?.name === characterName);
        if (charIndex < 0) throw new Error(`Character not found: ${characterName}`);
        await context.writeExtensionField(charIndex, Settings.EXTENSION_KEY, extensionData);
        context.characters[charIndex].data ??= {};
        context.characters[charIndex].data.extensions ??= {};
        context.characters[charIndex].data.extensions[Settings.EXTENSION_KEY] = extensionData;
    }

    async fetchSprites(folderName) {
        const res = await fetch(`/api/sprites/get?name=${encodeURIComponent(folderName)}`, {
            headers: getRequestHeaders(),
        });
        if (!res.ok) return [];
        return await res.json();
    }

    buildSpriteUploadForm(folderName, spriteName, file, fileField = 'file') {
        const form = new FormData();
        form.append('name', folderName);
        form.append('label', spriteName);
        form.append('spriteName', spriteName);
        form.append(fileField, file);
        return form;
    }

    async postSpriteUpload(form) {
        const headers = getRequestHeaders();
        delete headers['Content-Type'];
        delete headers['content-type'];
        return await fetch('/api/sprites/upload', {
            method: 'POST',
            headers,
            body: form,
        });
    }

    async uploadSpriteWithFallback(folderName, spriteName, file) {
        // ST builds may wire different multer field names for sprite upload.
        const first = await this.postSpriteUpload(this.buildSpriteUploadForm(folderName, spriteName, file, 'file'));
        if (first.ok) return first;

        if (![400, 500].includes(first.status)) {
            return first;
        }

        return await this.postSpriteUpload(this.buildSpriteUploadForm(folderName, spriteName, file, 'avatar'));
    }

    async fetchGalleryItems(folderName) {
        try {
            const response = await fetch('/api/images/list', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    folder: folderName,
                    sortField: 'date',
                    sortOrder: 'desc',
                    type: 3,
                }),
            });
            if (!response.ok) return [];
            const files = await response.json();
            return Array.isArray(files) ? files.map(file => ({
                name: file,
                path: `user/images/${encodeURIComponent(folderName)}/${encodeURIComponent(file)}`,
            })) : [];
        } catch {
            return [];
        }
    }

    getImageOverrides(extension) {
        const imageOverrides = extension.imageOverrides ?? {};
        const spriteOverrides = extension.spriteOverrides ?? {};
        const merged = { ...imageOverrides };
        for (const [key, value] of Object.entries(spriteOverrides)) {
            if (!merged[key]) merged[key] = { type: 'sprite', label: value };
        }
        return merged;
    }

    async showGalleryModal(item, onUse) {
        const blocker = document.createElement('div');
        blocker.classList.add('sttc--gallery-modal');

        const modal = document.createElement('div');
        modal.classList.add('sttc--gallery-modal-inner');

        const close = () => {
            document.removeEventListener('keydown', onKeyDown, true);
            blocker.remove();
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') close();
        };

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.classList.add('menu_button');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', close);

        const image = document.createElement('img');
        image.src = item.path;
        image.classList.add('sttc--gallery-modal-image');

        const actions = document.createElement('div');
        actions.classList.add('sttc--gallery-modal-actions');

        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.classList.add('menu_button');
        useBtn.textContent = 'Use image';
        useBtn.addEventListener('click', async () => {
            await onUse(item);
            close();
        });

        actions.append(useBtn, closeBtn);
        modal.append(image, actions);
        blocker.append(modal);
        blocker.addEventListener('mousedown', (e) => {
            if (e.target === blocker) close();
        });
        document.addEventListener('keydown', onKeyDown, true);
        document.body.append(blocker);
    }

    renderImageScaleControl() {
        const wrap = document.createElement('div');
        wrap.classList.add('sttc--scale-control');
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '48';
        slider.max = '256';
        slider.step = '2';
        slider.value = String(this.imageHeightPx ?? 94);
        const number = document.createElement('input');
        number.type = 'number';
        number.classList.add('text_pole');
        number.min = '48';
        number.max = '256';
        number.step = '2';
        number.value = slider.value;
        const apply = (raw) => {
            const n = Math.min(256, Math.max(48, Number(raw) || 94));
            slider.value = String(n);
            number.value = String(n);
            this.imageHeightPx = n;
            this.save();
        };
        slider.addEventListener('input', () => apply(slider.value));
        number.addEventListener('change', () => apply(number.value));
        wrap.append(slider, number);
        return wrap;
    }

    renderRangeControl(min, max, step, value, onApply) {
        const wrap = document.createElement('div');
        wrap.classList.add('sttc--scale-control');
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(value);
        const number = document.createElement('input');
        number.type = 'number';
        number.classList.add('text_pole');
        number.min = String(min);
        number.max = String(max);
        number.step = String(step);
        number.value = slider.value;
        const apply = (raw) => {
            const n = Math.min(max, Math.max(min, Number(raw) || value));
            slider.value = String(n);
            number.value = String(n);
            onApply(n);
        };
        slider.addEventListener('input', () => apply(slider.value));
        number.addEventListener('change', () => apply(number.value));
        wrap.append(slider, number);
        return wrap;
    }

    renderAdvancedStyleControls() {
        const wrap = document.createElement('div');
        wrap.classList.add('sttc--advanced-style-controls');
        const mkNum = (labelText, min, max, step, value, cb) => {
            const row = document.createElement('div');
            row.classList.add('sttc--scale-control');
            const label = document.createElement('div');
            label.classList.add('sttc--sprite-field-label');
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = 'number';
            input.classList.add('text_pole');
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.addEventListener('change', () => cb(Number(input.value)));
            row.append(label, input);
            return row;
        };

        wrap.append(
            mkNum('Card Gap (px)', 0, 48, 1, this.cardGapPx, (v)=>{ this.cardGapPx = Math.max(0, Math.min(48, v || 6)); this.save(); }),
            mkNum('Nametag Size (px)', 8, 24, 1, this.nametagSizePx, (v)=>{ this.nametagSizePx = Math.max(8, Math.min(24, v || 11)); this.save(); }),
            mkNum('Nametag Opacity (0-1)', 0, 1, 0.05, this.nametagOpacity, (v)=>{ this.nametagOpacity = Math.max(0, Math.min(1, v || 0.9)); this.save(); }),
        );
        return wrap;
    }

    async renderSpriteRows(content, characterName) {
        content.innerHTML = '';
        if (!characterName) {
            content.textContent = 'Select a character to manage Trigger Cards sprites.';
            return;
        }

        const extension = this.getCharacterExtensions(characterName);
        const imageOverrides = this.getImageOverrides(extension);
        const cards = this.getCardEntriesForCharacter(characterName, imageOverrides);

        if (!cards.length) {
            content.textContent = 'No Trigger Cards found. Configure Members first.';
            return;
        }

        for (const cardKey of cards) {
            const spriteName = `tc_${this.safeKey(cardKey)}`;
            const override = imageOverrides[cardKey];
            const activeLabel = (override?.type === 'sprite' ? override.label : null) ?? String(this.expression ?? '').toLowerCase();
            const targets = [characterName];
            let preview = '';
            let effectiveFolder = targets[0] ?? characterName;
            if (override?.type === 'gallery' && override.path) {
                preview = override.path;
            } else {
                for (const targetFolder of targets) {
                    const sprites = await this.fetchSprites(targetFolder);
                    const matches = sprites.filter(s => String(s.label).toLowerCase() === String(activeLabel).toLowerCase());
                    if (matches.length > 0) {
                        preview = matches[0]?.path ?? '';
                        effectiveFolder = targetFolder;
                        break;
                    }
                }
            }

            const row = document.createElement('div');
            row.classList.add('sttc--sprite-row');

            const info = document.createElement('div');
            info.classList.add('sttc--sprite-info');
            const title = document.createElement('div');
            title.classList.add('sttc--sprite-name');
            title.textContent = cardKey;
            const source = document.createElement('div');
            source.classList.add('sttc--sprite-source');
            source.textContent = override
                ? (override.type === 'gallery'
                    ? `Using gallery image (${override.path.split('/').pop()})`
                    : `Using custom sprite (${override.label})`)
                : `Using emotion sprite (${this.expression})`;
            const folderHint = document.createElement('div');
            folderHint.classList.add('sttc--sprite-source');
            folderHint.textContent = `Folder: ${effectiveFolder}`;
            info.append(title, source, folderHint);

            const img = document.createElement('img');
            img.classList.add('sttc--sprite-preview');
            img.src = preview;
            img.alt = `${cardKey} preview`;

            const controls = document.createElement('div');
            controls.classList.add('sttc--sprite-controls');

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.classList.add('sttc--sprite-file');

            const fileLabel = document.createElement('span');
            fileLabel.classList.add('sttc--sprite-file-label');
            fileLabel.textContent = 'No image selected';

            const choose = document.createElement('button');
            choose.type = 'button';
            choose.classList.add('menu_button');
            choose.textContent = 'Choose image';
            choose.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', () => {
                const file = fileInput.files?.[0];
                fileLabel.textContent = file?.name ?? 'No image selected';
            });

            const upload = document.createElement('button');
            upload.type = 'button';
            upload.classList.add('menu_button');
            upload.textContent = 'Upload/Replace';
            upload.addEventListener('click', async () => {
                const file = fileInput.files?.[0];
                if (!file) return toastr.warning('Pick an image first.');
                try {
                    const response = await this.uploadSpriteWithFallback(effectiveFolder, spriteName, file);
                    if (!response.ok) {
                        const details = (await response.text()).trim();
                        toastr.error(`Upload failed (${response.status}): ${(details || 'No server details').slice(0, 300)}`);
                        return;
                    }
                    const next = { ...imageOverrides, [cardKey]: { type: 'sprite', label: spriteName } };
                    await this.saveCharacterExtensions(characterName, { ...extension, imageOverrides: next, spriteOverrides: undefined });
                    this.save();
                    await this.renderSpriteRows(content, characterName);
                } catch (ex) {
                    toastr.error(`Upload failed: ${ex?.message ?? String(ex)}`);
                }
            });

            const galleryBtn = document.createElement('button');
            galleryBtn.type = 'button';
            galleryBtn.classList.add('menu_button');
            galleryBtn.textContent = 'Open gallery';
            galleryBtn.addEventListener('click', async () => {
                const items = await this.fetchGalleryItems(effectiveFolder);
                if (items.length === 0) {
                    toastr.info('No gallery images found in this folder.');
                    return;
                }
                const picker = document.createElement('div');
                picker.classList.add('sttc--gallery-picker');
                for (const item of items.slice(0, 30)) {
                    const thumb = document.createElement('img');
                    thumb.src = item.path;
                    thumb.classList.add('sttc--gallery-thumb');
                    thumb.title = item.name;
                    thumb.addEventListener('click', async () => {
                        await this.showGalleryModal(item, async (chosen) => {
                            const next = { ...imageOverrides, [cardKey]: { type: 'gallery', path: chosen.path } };
                            await this.saveCharacterExtensions(characterName, { ...extension, imageOverrides: next, spriteOverrides: undefined });
                            this.save();
                            picker.remove();
                            await this.renderSpriteRows(content, characterName);
                        });
                    });
                    picker.append(thumb);
                }
                row.append(picker);
            });

            const cropBtn = document.createElement('button');
            cropBtn.type = 'button';
            cropBtn.classList.add('menu_button');
            cropBtn.textContent = 'Crop → Sprite copy';
            cropBtn.addEventListener('click', async () => {
                toastr.info('Crop flow placeholder: use Gallery modal + Use image for now.');
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.classList.add('menu_button');
            remove.textContent = 'Remove custom';
            remove.style.display = override ? '' : 'none';
            remove.addEventListener('click', async () => {
                if (override?.type === 'sprite') {
                    const response = await fetch('/api/sprites/delete', {
                        method: 'POST',
                        headers: getRequestHeaders(),
                        body: JSON.stringify({ name: effectiveFolder, label: spriteName, spriteName }),
                    });
                    if (!response.ok && response.status !== 404) {
                        toastr.error(`Delete failed: ${response.status}`);
                        return;
                    }
                }
                const next = { ...imageOverrides };
                delete next[cardKey];
                await this.saveCharacterExtensions(characterName, { ...extension, imageOverrides: next, spriteOverrides: undefined });
                this.save();
                await this.renderSpriteRows(content, characterName);
            });

            controls.append(fileInput, choose, fileLabel, upload, galleryBtn, cropBtn, remove);
            row.append(img, info, controls);
            content.append(row);
        }
    }

    renderSpriteManager() {
        const wrap = document.createElement('div');
        wrap.classList.add('sttc--sprite-manager');
        const context = getContext();
        const chars = (context?.characters ?? []).map(c => c?.name).filter(Boolean);

        const preview = document.createElement('div');
        preview.classList.add('sttc--sprite-manager-preview');
        const previewImg = document.createElement('img');
        previewImg.classList.add('sttc--sprite-manager-preview-image');
        const previewLabel = document.createElement('div');
        previewLabel.classList.add('sttc--sprite-field-label');
        previewLabel.textContent = 'Select a card row to preview';
        preview.append(previewImg, previewLabel);

        const select = document.createElement('select');
        select.classList.add('text_pole');
        const selectLabel = document.createElement('div');
        selectLabel.classList.add('sttc--sprite-field-label');
        selectLabel.textContent = 'Character';
        const initial = document.createElement('option');
        initial.value = '';
        initial.textContent = '-- Select character --';
        select.append(initial);
        for (const name of chars) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.append(option);
        }
        this.spriteManagerCharacter ??= context?.characters?.[context.characterId]?.name ?? chars[0] ?? '';
        if (this.spriteManagerCharacter) select.value = this.spriteManagerCharacter;

        const content = document.createElement('div');
        content.classList.add('sttc--sprite-manager-list');

        select.addEventListener('change', async () => {
            this.spriteManagerCharacter = select.value || null;
            this.spriteManagerCardKey = null;
            await this.renderSpriteRows(content, this.spriteManagerCharacter);
        });

        content.addEventListener('click', (evt)=>{
            const row = evt.target.closest('.sttc--sprite-row');
            if (!row) return;
            const img = row.querySelector('.sttc--sprite-preview');
            previewImg.src = img?.src ?? '';
            previewLabel.textContent = row.querySelector('.sttc--sprite-name')?.textContent ?? 'Preview';
        });

        wrap.append(preview, selectLabel, select, content);
        this.renderSpriteRows(content, this.spriteManagerCharacter);
        return wrap;
    }

    save(isRestart = false) {
        saveMetadataDebounced();
        if (isRestart) {
            this.onRestart?.();
        }
    }

    async init() {
        const response = await fetch('/scripts/extensions/third-party/SillyTavern-TriggerCards/html/settings.html');
        if (!response.ok) {
            return console.warn('failed to fetch template: sttc--settings.html');
        }
        const settingsTpl = document
            .createRange()
            .createContextualFragment(await response.text())
            .querySelector('#sttc--settings-v2')
        ;
        const dom = /**@type {HTMLElement} */(settingsTpl.cloneNode(true));
        this.dom = dom;

        dom.querySelector('#sttc--settings-close').addEventListener('click', ()=>{
            this.hide();
        });
        dom.querySelector('.contentWrapper').addEventListener('scroll', ()=>this.updateCategory());

        const search = /**@type {HTMLInputElement}*/(dom.querySelector('.search'));
        search.addEventListener('input', ()=>{
            const query = search.value.trim().toLowerCase();
            for (const setting of this.settingList) {
                if (setting.name.toLowerCase().includes(query) || setting.description.toLowerCase().includes(query)) {
                    setting.dom.classList.remove('hidden');
                } else {
                    setting.dom.classList.add('hidden');
                }
            }
            const cats = [...dom.querySelectorAll('.contentWrapper .category:has(.item:not(.hidden)) > .head')].map(it=>it.textContent);
            const heads = [...dom.querySelectorAll('.categoriesWrapper .category .head')];
            for (const head of heads) {
                if (cats.includes(head.textContent)) {
                    head.classList.remove('hidden');
                } else {
                    head.classList.add('hidden');
                }
            }
            this.updateCategory();
        });

        // build tree
        const tree = {};
        for (const setting of this.settingList) {
            let cur = tree;
            for (const key of setting.category) {
                if (!cur[key]) {
                    cur[key] = { name:key, settings:[] };
                }
                cur = cur[key];
            }
            cur.settings.push(setting);
        }

        // render tree
        const catRoot = /**@type {HTMLElement}*/(dom.querySelector('.categoriesWrapper'));
        const contRoot = /**@type {HTMLElement}*/(dom.querySelector('.contentWrapper'));
        const render = (cat, cont, cur, level = 0)=>{
            for (const key of Object.keys(cur)) {
                if (['name', 'settings'].includes(key)) continue;
                const curCat = cur[key];
                const block = document.createElement('div'); {
                    block.classList.add('category');
                    const head = document.createElement('div'); {
                        head.classList.add('head');
                        head.setAttribute('data-level', level.toString());
                        head.dataset.key = key.toLowerCase().replace(/\s+/g, '-');
                        head.textContent = key;
                        block.append(head);
                    }
                }
                const catBlock = /**@type {HTMLElement}*/(block.cloneNode(true));
                catBlock.querySelector('.head').dataset.key = key.toLowerCase().replace(/\s+/g, '-');
                catBlock.querySelector('.head').addEventListener('click', ()=>{
                    let offset = 0;
                    let head = /**@type {HTMLElement}*/(block.querySelector('.head'));
                    head = head.closest('.category').parentElement.closest('.category')?.querySelector('.head');
                    while (head) {
                        offset += head.offsetHeight;
                        head = head.closest('.category').parentElement.closest('.category')?.querySelector('.head');
                    }
                    contRoot.scrollTo({
                        top: block.offsetTop - offset,
                        behavior: 'smooth',
                    });
                });
                cat.append(catBlock);
                cont.append(block);
                for (const setting of curCat.settings) {
                    const item = setting.render();
                    block.append(item);
                }
                render(catBlock, block, curCat, level + 1);
            }
        };
        render(catRoot, contRoot, tree);
    }


    updateCategory() {
        const wrapRect = this.dom.querySelector('.contentWrapper').getBoundingClientRect();
        for (const setting of this.settingList) {
            const rect = setting.dom.getBoundingClientRect();
            if (rect.top > wrapRect.top || rect.top < wrapRect.top && rect.bottom > wrapRect.top + wrapRect.height / 4) {
                const cat = setting.dom.closest('.category').querySelector('.head').textContent;
                const heads = [...this.dom.querySelectorAll('.categoriesWrapper .head')];
                for (const head of heads) {
                    if (head.textContent == cat) {
                        let cur = head;
                        cur.classList.add('current');
                        while (cur) {
                            cur = cur.closest('.category').parentElement.closest('.category')?.querySelector('.head');
                            cur?.classList?.add('current');
                        }
                    } else {
                        head.classList.remove('current');
                    }
                }
                return;
            }
        }
    }

    async show(parent = document.body) {
        if (this.parent != parent) {
            this.parent = parent;
            parent.addEventListener('keydown', (evt)=>{
                if (!this.dom.classList.contains('sttc--active')) return;
                const query = this.dom.querySelector('.search');
                const rect = query.getBoundingClientRect();
                if (document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) != query) return;
                if (evt.ctrlKey && evt.key == 'f') {
                    evt.preventDefault();
                    evt.stopPropagation();
                    this.dom.querySelector('.search').select();
                }
            });
        }
        parent.append(this.dom);
        this.dom.classList.add('sttc--active');
        this.dom.style.bottom = `calc(100dvh + 50px - ${document.querySelector('#form_sheld').getBoundingClientRect().top}px)`;
        this.onShow?.();
        await delay(200);
        this.updateCategory();
        this.dom.querySelector('.search').select();
    }
    hide() {
        this.dom.classList.remove('sttc--active');
        this.dom.remove();
        this.onHide?.();
    }
    async toggle(parent) {
        if (this.isActive) {
            this.hide();
        } else {
            await this.show(parent);
        }
    }
}
