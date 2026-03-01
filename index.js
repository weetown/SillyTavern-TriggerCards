import { characters, chat_metadata, eventSource, event_types, getRequestHeaders, reloadMarkdownProcessor, sendSystemMessage } from '../../../../script.js';
import { getContext, saveMetadataDebounced, renderExtensionTemplateAsync } from '../../../extensions.js';
import { executeSlashCommands, executeSlashCommandsWithOptions, registerSlashCommand } from '../../../slash-commands.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue } from '../../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { debounce, delay } from '../../../utils.js';
import { quickReplyApi } from '../../quick-reply/index.js';
import { Settings } from './src/Settings.js';

const log = (...msg) => console.log('[TC]', ...msg);

/**@type {Settings} */
let settings;
/**@type {Promise} */
let loop;
/**@type {Boolean} */
let isRunning = false;
/**@type {string} */
export let groupId;
/**@type {HTMLElement} */
let root;
/**@type {HTMLElement} */
let tray;
/**@type {HTMLImageElement[]} */
let imgs = [];
/**@type {string[]} */
let nameList = [];
let lastCollapsedState;

/** Bottom-bar Extensions (wand) menu + main Extensions panel integration **/
const STTC_IDS = {
    wandItem: 'sttc-wand-settings-menu-item',
    wandBtn: 'sttc-wand-settings',
    panelContainer: 'sttc_container',
    panelEnabled: 'sttc-enabled-toggle',
    panelOpen: 'sttc-open-settings',
    panelStatus: 'sttc-status',
    panelCollapsed: 'sttc-collapsed-toggle',
};

const addWandMenuUi = () => {
    const container = document.getElementById('extensionsMenu');
    if (!container) return;
    if (document.getElementById(STTC_IDS.wandItem)) return;

    const item = document.createElement('div');
    item.id = STTC_IDS.wandItem;
    item.className = 'list-group-item flex-container flexGap5';
    item.title = 'Open Trigger Cards settings';
    item.innerHTML = `
        <div id="${STTC_IDS.wandBtn}" class="extensionsMenuExtensionButton fa-solid fa-sliders"></div>
        Trigger Cards Settings
    `;
    item.addEventListener('click', async () => {
        try {
            await settings?.show();
        } catch (ex) {
            toastr.error(ex?.message ?? String(ex));
        }
    });
    container.append(item);
};

const addExtensionsPanelUi = async () => {
    try {
        const settingsHtml = await renderExtensionTemplateAsync('third-party/SillyTavern-TriggerCards', 'settings');
        const container = document.getElementById(STTC_IDS.panelContainer) ?? document.getElementById('extensions_settings');
        if (!container) return;

        // Prevent double-insertion
        if (document.getElementById(STTC_IDS.panelEnabled) || document.getElementById(STTC_IDS.panelOpen)) return;

        container.insertAdjacentHTML('beforeend', settingsHtml);

        // Wire events (delegated, in case ST re-renders the drawer)
        $(document).on('click', `#${STTC_IDS.panelOpen}`, async () => {
            try {
                await settings?.show();
            } catch (ex) {
                toastr.error(ex?.message ?? String(ex));
            }
        });

        $(document).on('change', `#${STTC_IDS.panelEnabled}`, async (evt) => {
            try {
                if (!settings) return;
                settings.isEnabled = evt.target.checked;
                saveMetadataDebounced();
                if (settings.isEnabled) {
                    await restart();
                } else {
                    await end();
                }
                syncExtensionsPanelUi();
            } catch (ex) {
                toastr.error(ex?.message ?? String(ex));
            }
        });

        $(document).on('change', `#${STTC_IDS.panelCollapsed}`, (evt) => {
            if (!settings) return;
            settings.isCollapsed = evt.target.checked;
            saveMetadataDebounced();
            applyCollapsedState(settings.isCollapsed);
            syncExtensionsPanelUi();
        });

        syncExtensionsPanelUi();
    } catch (ex) {
        // If ST changes template APIs, don't crash the extension
        console.warn('[TC] Failed to add Extensions panel UI:', ex);
    }
};

const syncExtensionsPanelUi = () => {
    const enabled = Boolean(settings?.isEnabled);
    const toggle = document.getElementById(STTC_IDS.panelEnabled);
    if (toggle) toggle.checked = enabled;
    const collapsedToggle = document.getElementById(STTC_IDS.panelCollapsed);
    if (collapsedToggle) collapsedToggle.checked = Boolean(settings?.isCollapsed);
    const status = document.getElementById(STTC_IDS.panelStatus);
    if (status) status.textContent = enabled ? 'Enabled for this chat' : 'Disabled for this chat';
};

const applyCollapsedState = (isCollapsed) => {
    if (!root) return;
    root.classList.toggle('sttc--collapsed', isCollapsed);
    const toggle = root.querySelector('.sttc--toggle');
    if (toggle) {
        toggle.textContent = isCollapsed ? '▲ Cards' : '▼ Cards';
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        toggle.setAttribute('title', isCollapsed ? 'Show Trigger Cards' : 'Hide Trigger Cards');
    }
};





/**
 * Piggyback on SillyTavern's built-in sprites/expressions system.
 * This asks the server what sprite files exist instead of guessing + HEAD probing.
 *
 * Endpoint (server): GET /api/sprites/get?name=<characterNameOrSubfolder>
 * Returns: [{ label, path }, ...]
 * label is base expression label (neutral / joy etc) even for suffixes: neutral-1 / neutral.expressive
 * path is a ready-to-use URL with cache-busting query (?t=mtime)
 */
const spriteListCache = new Map(); // name -> { time:number, sprites:any[] }
const SPRITE_CACHE_TTL = 30_000; // ms (does NOT get cleared on expression change)

const clearSpriteCache = () => spriteListCache.clear();

const getSpritesForCharacter = async (name) => {
    const now = Date.now();
    const cached = spriteListCache.get(name);

    if (cached && (now - cached.time) < SPRITE_CACHE_TTL) {
        return cached.sprites;
    }

    try {
        const res = await fetch(`/api/sprites/get?name=${encodeURIComponent(name)}`, {
            headers: getRequestHeaders(),
        });

        if (!res.ok) {
            const empty = [];
            spriteListCache.set(name, { time: now, sprites: empty });
            return empty;
        }

        const sprites = await res.json();
        spriteListCache.set(name, { time: now, sprites });
        return sprites;
    } catch {
        const empty = [];
        spriteListCache.set(name, { time: now, sprites: empty });
        return empty;
    }
};

/**
 * Avatar thumbnail fallback if no expression sprite is found.
 * Uses the character's avatar filename from context (preferred).
 */
const getAvatarThumb = (characterName) => {
    try {
        const ctx = getContext();
        const char = ctx?.characters?.find(c => c?.name === characterName);
        if (!char?.avatar) return null;
        return `/thumbnail?type=avatar&file=${encodeURIComponent(char.avatar)}`;
    } catch {
        return null;
    }
};

/**
 * Picks which variant to use when multiple sprites share the same label.
 * - 'first': stable, cheapest
 * - 'random': fun, changes per call
 */
const pickSpriteVariant = (matches, mode = 'first') => {
    if (!matches || matches.length === 0) return undefined;
    if (mode === 'random') {
        return matches[Math.floor(Math.random() * matches.length)];
    }
    return matches[0];
};

/**
 * Main resolver used everywhere in the extension.
 * Name may be "Character" or "Character/subfolder".
 */
const findImage = async (name) => {
    // 1) Ask ST for list of sprites that exist for this character folder
    const sprites = await getSpritesForCharacter(name);

    // labels from server are lowercased; normalize ours too
    const target = String(settings.expression ?? '').toLowerCase();

    const matches = sprites.filter(s => String(s.label).toLowerCase() === target);

    if (matches.length > 0) {
        // stable pick; change to 'random' if you want random variants
        const chosen = pickSpriteVariant(matches, 'first');
        return chosen?.path;
    }

    // 2) If no expression sprites exist, fallback to avatar thumbnail
    const thumb = getAvatarThumb(name.includes('/') ? name.split('/')[0] : name);
    if (thumb) return thumb;

    // 3) Nothing found
    return undefined;
};






const loadSettings = ()=>{
    settings = new Settings();
    settings.onRestart = ()=>restartDebounced();
    chat_metadata.triggerCards = settings;
};

const init = ()=>{
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'tc-config',
        callback: async(args, value)=>{
            await settings.show();
            return '';
        },
        helpString: 'Open Trigger Cards setting menu.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'tc-on',
        callback: (args, value)=>activate(args, value),
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'actions',
                description: 'name of a QR set for click actions, see /tc?',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: ()=>quickReplyApi.listSets().map(it=>new SlashCommandEnumValue(it)),
            }),
            SlashCommandNamedArgument.fromProps({ name: 'members',
                description: 'name of a QR set used as member list, see /tc?',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: ()=>quickReplyApi.listSets().map(it=>new SlashCommandEnumValue(it)),
            }),
            SlashCommandNamedArgument.fromProps({ name: 'emote',
                description: 'character expression to use for trigger card',
                typeList: [ARGUMENT_TYPE.STRING],
                enumList: [
                    'admiration','amusement','anger','annoyance','approval','caring','confusion','curiosity','desire',
                    'disappointment','disapproval','disgust','embarrassment','excitement','fear','gratitude','grief',
                    'joy','love','nervousness','optimism','pride','realization','relief','remorse','sadness','surprise',
                    'neutral',
                ],
            }),
            SlashCommandNamedArgument.fromProps({ name: 'extensions',
                description: 'file extensions to use for expression image',
                typeList: [ARGUMENT_TYPE.STRING],
            }),
            SlashCommandNamedArgument.fromProps({ name: 'grayscale',
                description: 'show absent members desaturated',
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
            SlashCommandNamedArgument.fromProps({ name: 'mute',
                description: 'show unmuted characters opaque',
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
            SlashCommandNamedArgument.fromProps({ name: 'reset',
                description: 'reset all settings',
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'comma separated list of names to use as member list',
                typeList: ARGUMENT_TYPE.STRING,
            }),
        ],
        helpString: 'Activate Trigger Cards',
    }));

    registerSlashCommand('tc-off', (args, value)=>deactivate(), [], 'Deactivate trigger cards', true, true);
    registerSlashCommand('tc?', (args, value)=>showHelp(), [], 'Show help for trigger cards', true, true);
};
init();

const activate = async(args, members) => {
    const memberList = members?.split(/\s*,\s*/)?.filter(it=>it);
    const extList = args.extensions?.split(',')?.map(s => s.trim())?.filter(it=>it);

    // Named args already come through as booleans for BOOLEAN types
    const gray = (typeof args.grayscale === 'boolean') ? args.grayscale : null;
    const mute = (typeof args.mute === 'boolean') ? args.mute : null;

    settings.actionQrSet = args.actions ?? (args.reset ? undefined : settings.actionQrSet);
    settings.memberQrSet = args.members ?? (args.reset ? undefined : settings.memberQrSet);
    settings.memberList = memberList && memberList.length > 0 ? memberList : (args.reset ? undefined : settings.memberList);
    if (settings.memberList && settings.memberList.filter(it=>it).length <= 0) settings.memberList = undefined;

    settings.expression = args.emote ?? (args.reset ? 'joy' : settings.expression) ?? 'joy';

    // Fix: use settings.extensions, not settings.extList
    settings.extensions = extList && extList.length > 0
        ? extList
        : (args.reset ? ['png', 'webp', 'gif'] : settings.extensions) ?? ['png', 'webp', 'gif'];

    if (settings.extensions && settings.extensions.filter(it=>it).length <= 0) settings.extensions = ['png', 'webp', 'gif'];

    settings.grayscale = gray ?? (args.reset ? true : settings.grayscale) ?? true;
    settings.mute = mute ?? (args.reset ? true : settings.mute) ?? true;

    settings.isEnabled = true;

    saveMetadataDebounced();
    restart();

    let wasActive = settings.isActive;
    if (wasActive) settings.hide();
    settings.registerSettings();
    await settings.init();
    if (wasActive) settings.show();
};

const deactivate = async () => {
    settings.isEnabled = false;
    saveMetadataDebounced();
    await end();

    let wasActive = settings.isActive;
    if (wasActive) settings.hide();
    settings.registerSettings();
    await settings.init();
    if (wasActive) settings.show();
};

const showHelp = async () => {
    const converter = reloadMarkdownProcessor();
    const readme = await (await fetch('/scripts/extensions/third-party/SillyTavern-TriggerCards/README.md')).text();
    sendSystemMessage('generic', converter.makeHtml(readme).replace(/(src=")(?=[^/])/g, '$1/scripts/extensions/third-party/SillyTavern-TriggerCards/'));
};






const chatChanged = async()=>{
    const context = getContext();
    groupId = context.groupId;

    // Different chat, different character set: clear cached sprite lists
    clearSpriteCache();

    loadSettings();
    if (settings?.isEnabled) {
        await restart();
    } else {
        await end();
    }
    syncExtensionsPanelUi();
};
eventSource.on(event_types.CHAT_CHANGED, ()=>(chatChanged(),null));






const handleClick = async (/**@type {MouseEvent}*/evt, /**@type {string}*/fullName) => {
    evt.preventDefault();
    evt.stopPropagation();
    const [name, ...args] = fullName.split('::');

    if (settings.memberQrSet && args.includes('qr')) {
        try {
            await quickReplyApi.executeQuickReply(settings.memberQrSet, fullName);
        } catch (ex) {
            toastr.error(ex.message);
        }
    } else {
        const modifiers = [];
        if (evt.ctrlKey) modifiers.push('c');
        if (evt.shiftKey) modifiers.push('s');
        if (evt.altKey) modifiers.push('a');
        const mod = modifiers.join('');

        if (settings.actionQrSet) {
            if (quickReplyApi.listQuickReplies(settings.actionQrSet).includes(mod)) {
                try {
                    await quickReplyApi.executeQuickReply(settings.actionQrSet, mod, { name, set:settings.memberQrSet });
                } catch (ex) {
                    toastr.error(ex.message);
                }
            } else if (settings.memberQrSet) {
                try {
                    await quickReplyApi.executeQuickReply(settings.memberQrSet, fullName, { name });
                } catch (ex) {
                    toastr.error(ex.message);
                }
            }
        } else {
            let cmd;
            switch (mod) {
                case '': {
                    cmd = `/trigger ${name}`;
                    break;
                }
                case 's': {
                    cmd = `/enable ${name}`;
                    break;
                }
                case 'a': {
                    cmd = `/disable ${name}`;
                    break;
                }
            }
            if (cmd) {
                try {
                    executeSlashCommands(cmd);
                } catch (ex) {
                    toastr.error(ex.message);
                }
            }
        }
    }
};

/**
 * @param {MouseEvent} evt
 * @param {string} fullName
 * @param {HTMLElement} wrap
 */
const handleContext = async(evt, fullName, wrap) => {
    evt.preventDefault();
    evt.stopPropagation();
    wrap.classList.add('sttc--hover');

    const [name, ...args] = fullName.split('::');

    let response;
    try {
        response = await fetch('/api/plugins/costumes/', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ folder: name, recurse: true }),
        });
    } catch (e) {
        wrap.classList.remove('sttc--hover');
        toastr.error('Costumes plugin not available.');
        return;
    }

    if (!response.ok) {
        wrap.classList.remove('sttc--hover');
        toastr.error(`Failed to retrieve costumes: ${response.status} - ${response.statusText}`);
        return;
    }

    const costumes = await response.json();
    const rect = wrap.getBoundingClientRect();

    const blocker = document.createElement('div'); {
        blocker.classList.add('sttc--blocker');

        // Close helper (cleans up listeners + UI state)
        const onKeyDown = (e) => {
            if (e.key === 'Escape') close();
        };

        const close = () => {
            try { document.removeEventListener('keydown', onKeyDown, true); } catch { /* ignore */ }
            blocker.remove();
            wrap.classList.remove('sttc--hover');
        };

        // Click outside to close (only if clicking the overlay itself)
        blocker.addEventListener('mousedown', (e) => {
            if (e.target === blocker) close();
        });

        // Escape to close
        document.addEventListener('keydown', onKeyDown, true);

        const clone = /**@type {HTMLElement}*/(wrap.cloneNode(true)); {
            clone.title = 'Close menu';
            clone.style.top = `${rect.top}px`;
            clone.style.left = `${rect.left}px`;
            clone.addEventListener('click', close);
            blocker.append(clone);
        }

        const content = document.createElement('div'); {
            content.classList.add('sttc--content');
            content.style.bottom = `calc(100vh - ${rect.top}px - 2em)`;

            // Header row with a big X button
            const header = document.createElement('div'); {
                header.classList.add('sttc--content-header');

                const title = document.createElement('div'); {
                    title.classList.add('sttc--content-title');
                    title.textContent = 'Costumes';
                    header.append(title);
                }

                const xBtn = document.createElement('button'); {
                    xBtn.classList.add('sttc--close');
                    xBtn.type = 'button';
                    xBtn.title = 'Close';
                    xBtn.textContent = '×';
                    xBtn.addEventListener('click', close);
                    header.append(xBtn);
                }

                content.append(header);
            }

            // No costumes case: show message but still allow close (overlay/esc/X)
            if (!Array.isArray(costumes) || costumes.length === 0) {
                const msg = document.createElement('div');
                msg.classList.add('sttc--empty');
                msg.textContent = 'No costumes found for this character.';
                content.append(msg);

                blocker.append(content);
                document.body.append(blocker);
                return;
            }

            // Costumes plugin preview probing (temporary, until moved to ST built-in /costume workflow)
            const urls = await Promise.all(costumes.map(async (costumePath) => {
                for (const ext of settings.extensions) {
                    const url = `/characters/${costumePath}/${settings.expression}.${ext}`;
                    const resp = await fetch(url, { method: 'HEAD', headers: getRequestHeaders() });
                    if (resp.ok) return url;
                }
                return undefined;
            }));

            let i = -1;
            for (const url of urls) {
                i++;
                const costume = costumes[i];

                const cost = document.createElement('div'); {
                    cost.classList.add('sttc--costume');
                    cost.addEventListener('click', ()=>{
                        settings.costumes[fullName] = costume;
                        close(); // uses shared close helper
                        executeSlashCommandsWithOptions(`/costume ${costume}`);
                        saveMetadataDebounced();

                        // Costume change can change what images appear; clear sprite cache + restart
                        clearSpriteCache();
                        restart();
                    });

                    const img = document.createElement('img'); {
                        img.src = url ?? '';
                        cost.append(img);
                    }

                    const lbl = document.createElement('div'); {
                        lbl.classList.add('sttc--label');
                        lbl.textContent = costume.split('/').pop();
                        cost.append(lbl);
                    }

                    content.append(cost);
                }
            }

            blocker.append(content);
        }

        document.body.append(blocker);
    }
};

const handleTitle = async (el, fullName) => {
    const [name, ...args] = fullName.split('::');
    let titleParts = [name];

    if (settings.memberQrSet && args.includes('qr')) {
        const qr = quickReplyApi.getQrByLabel(settings.memberQrSet, fullName);
        titleParts.push(qr.title || qr.message);
    } else if (settings.actionQrSet) {
        const mods = { 'c': 'ctrl', 's': 'shift', 'a': 'alt' };
        const set = quickReplyApi.getSetByName(settings.actionQrSet);
        titleParts.push(...set.qrList.map(qr=>`${[...qr.label.split('').map(m=>mods[m]), 'click'].join(' + ')}: ${qr.title ?? ''}`));
    } else {
        titleParts.push(
            'click: trigger',
            'shift + click: unmute',
            'alt + click: mute',
        );
    }

    titleParts.push('right click to change costume');
    titleParts.splice(1, 0, '-'.repeat(titleParts.reduce((max,cur)=>Math.max(max,cur.length),0) * 1.2));
    el.title = titleParts.join('\n');
};

const getNames = (present = false)=>{
    if (!present) {
        if (settings.memberList && settings.memberList.length > 0) {
            return settings.memberList;
        }
        if (settings.memberQrSet) {
            try {
                return quickReplyApi.listQuickReplies(settings.memberQrSet);
            } catch {
                return [];
            }
        }
    }

    if (groupId) {
        const context = getContext();
        const group = context.groups.find(it=>it.id == groupId);
        const members = group.members.map(m=>context.characters.find(c=>c.avatar == m));
        const names = members.map(it=>it.name);
        return names;
    } else {
        return [characters[getContext().characterId]].map(it=>it.name);
    }
};

const getMuted = ()=>{
    if (!groupId) return [];
    const context = getContext();
    const group = context.groups.find(it=>it.id == groupId);
    const members = group.disabled_members.map(m=>context.characters.find(c=>c.avatar == m));
    const names = members.map(it=>it.name);
    return names;
};

const updateMembers = async() => {
    let expression;
    let extensions;

    while (settings?.isEnabled && isRunning) {
        if (lastCollapsedState !== settings.isCollapsed) {
            applyCollapsedState(settings.isCollapsed);
            lastCollapsedState = settings.isCollapsed;
        }
        const names = getNames();
        const present = getNames(true);
        const muted = getMuted();

        const removed = nameList.filter(it=>names.indexOf(it) == -1);
        const added = names.filter(it=>nameList.indexOf(it) == -1);

        for (const name of removed) {
            nameList.splice(nameList.indexOf(name), 1);
            let idx = imgs.findIndex(it=>it.getAttribute('data-character') == name);
            const img = imgs.splice(idx, 1)[0];
            img?.closest('.sttc--wrapper')?.remove();
        }

        for (const name of added) {
            const namePart = name.split('::')[0];

            if (settings.costumes?.[namePart]) {
                executeSlashCommandsWithOptions(`/costume ${settings.costumes[namePart]}`);
            }

            nameList.push(name);

            const wrap = document.createElement('div'); {
                wrap.classList.add('sttc--wrapper');
                wrap.addEventListener('click', (evt)=>handleClick(evt, name));
                wrap.addEventListener('contextmenu', (evt)=>handleContext(evt, name, wrap));
                wrap.addEventListener('pointerenter', ()=>handleTitle(wrap, name));

                const img = document.createElement('img'); {
                    img.classList.add('sttc--img');
                    img.setAttribute('data-character', name);

                    // IMPORTANT: Use sprites endpoint for expression images
                    img.src = await findImage(settings.costumes?.[namePart] ?? namePart) ?? '';

                    wrap.append(img);
                }

                const before = imgs.find(it=>name.localeCompare(it.getAttribute('data-character')) == -1);
                if (before) {
                    log('putting', name, 'before', before);
                    before.closest('.sttc--wrapper').insertAdjacentElement('beforebegin', wrap);
                    imgs.splice(imgs.indexOf(before), 0, img);
                } else {
                    log('putting', name, 'at end');
                    tray?.append(wrap);
                    imgs.push(img);
                }
            }
        }

        imgs.forEach(async(img)=>{
            if (settings.grayscale && present.indexOf(img.getAttribute('data-character')) == -1) {
                img.closest('.sttc--wrapper').classList.add('sttc--absent');
            } else {
                img.closest('.sttc--wrapper').classList.remove('sttc--absent');
            }

            if (settings.mute && muted.indexOf(img.getAttribute('data-character')) == -1) {
                img.closest('.sttc--wrapper').classList.add('sttc--chatty');
            } else {
                img.closest('.sttc--wrapper').classList.remove('sttc--chatty');
            }

            // We do NOT clear sprite cache on expression change. We just pick a different label from cached list.
            if (expression != settings.expression || extensions != settings.extensions.join(', ')) {
                const namePart = img.getAttribute('data-character').split('::')[0];
                img.src = await findImage(settings.costumes?.[namePart] ?? namePart) ?? '';
            }
        });

        expression = settings.expression;
        extensions = settings.extensions.join(', ');
        await delay(500);
    }
};






const restart = async()=>{
    await end();
    start();
};
const restartDebounced = debounce(restart);

const start = () => {
    const form = document.querySelector('#form_sheld');
    if (!form) return;

    root = document.createElement('div'); {
        root.classList.add('sttc--root');
        const toggle = document.createElement('button'); {
            toggle.type = 'button';
            toggle.classList.add('sttc--toggle');
            toggle.addEventListener('click', (evt)=>{
                evt.preventDefault();
                evt.stopPropagation();
                settings.isCollapsed = !settings.isCollapsed;
                applyCollapsedState(settings.isCollapsed);
                lastCollapsedState = settings.isCollapsed;
                saveMetadataDebounced();
                syncExtensionsPanelUi();
            });
            root.append(toggle);
        }

        tray = document.createElement('div'); {
            tray.classList.add('sttc--tray');
            tray.addEventListener('wheel', evt=>{
                evt.preventDefault();
                tray.scrollLeft += evt.deltaY;
            }, { passive: false });
            root.append(tray);
        }

        form.append(root);
    }
    applyCollapsedState(settings.isCollapsed);
    lastCollapsedState = settings.isCollapsed;
    isRunning = true;
    loop = updateMembers();
};

const end = async () => {
    isRunning = false;
    if (loop) await loop;
    nameList = [];
    root?.remove();
    root = null;
    tray = null;
    lastCollapsedState = null;

    while (imgs.length > 0) {
        imgs.pop();
    }
};

/**
 * UI injection (runs once on load):
 * - Adds a menu entry into the bottom-bar Extensions popup (#extensionsMenu)
 * - Adds an entry into the main Extensions settings drawer (#extensions_settings)
 */
jQuery(async () => {
    // Add UI bits as soon as the relevant containers exist.
    addWandMenuUi();
    await addExtensionsPanelUi();

    // In case the menu is re-rendered later, re-try on APP_READY and on click open.
    eventSource.on(event_types.APP_READY, () => {
        addWandMenuUi();
        addExtensionsPanelUi();
    });

    // Ensure panel reflects current chat on first load (CHAT_CHANGED won't always fire on boot).
    try {
        await chatChanged();
    } catch {
        // ignore
    }
});
