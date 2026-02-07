import { characters, chat_metadata, eventSource, event_types, getRequestHeaders, reloadMarkdownProcessor, sendSystemMessage } from '../../../../script.js';
import { getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { executeSlashCommands, executeSlashCommandsWithOptions, registerSlashCommand } from '../../../slash-commands.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue } from '../../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { debounce } from '../../../utils.js';
import { quickReplyApi } from '../../quick-reply/index.js';
import { Settings } from './src/Settings.js';

const EXTENSION_URL = new URL('.', import.meta.url);
const EXTENSION_PATH = EXTENSION_URL.pathname;
const EXTENSION_RELATIVE_PATH = EXTENSION_PATH.split('/scripts/extensions/')[1]?.replace(/\/$/, '') ?? 'third-party/SillyTavern-TriggerCards';
const EXTENSION_README_URL = new URL('README.md', EXTENSION_URL).href;





/**@type {Settings} */
let settings;
/**@type {Boolean} */
let isRunning = false;
/**@type {string} */
export let groupId;
/**@type {HTMLElement} */
let root;
/**@type {Map<string, HTMLImageElement>} */
const imgsByName = new Map();
/**@type {Set<string>} */
let nameList = new Set();
const imageCache = new Map();
const memberState = {
    lastExpression: null,
    lastExtensionsKey: '',
    lastCostumesKey: '',
    lastPresentKey: '',
    lastMutedKey: '',
};
const pollState = {
    timer: null,
    delay: 2000,
};
let updateChain = Promise.resolve();

/** Bottom-bar Extensions (wand) menu + main Extensions panel integration **/
const STTC_IDS = {
    wandItem: 'sttc-wand-settings-menu-item',
    wandBtn: 'sttc-wand-settings',
    panelContainer: 'sttc_container',
    panelEnabled: 'sttc-enabled-toggle',
    panelOpen: 'sttc-open-settings',
    panelStatus: 'sttc-status',
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
        const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_RELATIVE_PATH, 'settings');
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
                settings.save();
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
    const status = document.getElementById(STTC_IDS.panelStatus);
    if (status) status.textContent = enabled ? 'Enabled for this chat' : 'Disabled for this chat';
};






const loadSettings = ()=>{
    settings = new Settings(chat_metadata.triggerCards ?? {});
    settings.onRestart = ()=>restartDebounced();
    settings.onUpdate = ()=>scheduleUpdate({ immediate: true });
    chat_metadata.triggerCards = settings.toJSON();
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
// eventSource.on(event_types.APP_READY, ()=>init());
const activate = async(args, members) => {
    const memberList = members?.split(/\s*,\s*/)?.filter(it=>it);
    const extList = args.extensions?.split(',')?.filter(it=>it);
    let gray;
    try {
        gray = JSON.parse(args.grayscale ?? 'null');
    } catch { /* empty */ }
    let mute;
    try {
        mute = JSON.parse(args.mute ?? 'null');
    } catch { /* empty */ }
    settings.actionQrSet = args.actions ?? (args.reset ? undefined : settings.actionQrSet);
    settings.memberQrSet = args.members ?? (args.reset ? undefined : settings.memberQrSet);
    settings.memberList = memberList && memberList.length > 0 ? memberList : (args.reset ? undefined : settings.memberList);
    if (settings.memberList && settings.memberList.filter(it=>it).length <= 0) settings.memberList = undefined;
    settings.expression = args.emote ?? (args.reset ? 'joy' : settings.expression) ?? 'joy';
    settings.extensions = extList && extList.length > 0 ? extList : (args.reset ? ['png', 'webp', 'gif'] : settings.extList) ?? ['png', 'webp', 'gif'];
    if (settings.extensions && settings.extensions.filter(it=>it).length <= 0) settings.extensions = ['png', 'webp', 'gif'];
    settings.grayscale = gray ?? (args.reset ? true : settings.grayscale) ?? true;
    settings.mute = mute ?? (args.reset ? true : settings.mute) ?? true;
    settings.isEnabled = true;
    settings.save(true);
    let wasActive = settings.isActive;
    if (wasActive) {
        settings.hide();
    }
    settings.registerSettings();
    await settings.init();
    if (wasActive) {
        settings.show();
    }
};
const deactivate = async () => {
    settings.isEnabled = false;
    settings.save();
    await end();
    let wasActive = settings.isActive;
    if (wasActive) {
        settings.hide();
    }
    settings.registerSettings();
    await settings.init();
    if (wasActive) {
        settings.show();
    }
};
const showHelp = async () => {
    const converter = reloadMarkdownProcessor();
    const readme = await (await fetch(EXTENSION_README_URL)).text();
    sendSystemMessage('generic', converter.makeHtml(readme).replace(/(src=")(?=[^/])/g, `$1${EXTENSION_PATH}`));
};






const chatChanged = async()=>{
    const context = getContext();
    groupId = context.groupId;
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
    const response = await fetch('/api/plugins/costumes/', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ folder: name, recurse: true }),
    });
    if (!response.ok) {
        wrap.classList.remove('sttc--hover');
        toastr.error(`Failed to retrieve costumes: ${response.status} - ${response.statusText}`);
        return;
    }
    const costumes = await response.json();
    const rect = wrap.getBoundingClientRect();
    const blocker = document.createElement('div'); {
        blocker.classList.add('sttc--blocker');
        const clone = /**@type {HTMLElement}*/(wrap.cloneNode(true)); {
            clone.title = 'Close menu';
            clone.style.top = `${rect.top}px`;
            clone.style.left = `${rect.left}px`;
            clone.addEventListener('click', ()=>{
                blocker.remove();
                wrap.classList.remove('sttc--hover');
            });
            blocker.append(clone);
        }
        const content = document.createElement('div'); {
            content.classList.add('sttc--content');
            content.style.bottom = `calc(100vh - ${rect.top}px - 2em)`;
            const urls = await Promise.all(costumes.map(it=>findImage(it)));
            let i = -1;
            for (const url of urls) {
                i++;
                const costume = costumes[i];
                const cost = document.createElement('div'); {
                    cost.classList.add('sttc--costume');
                    cost.addEventListener('click', ()=>{
                        settings.costumes[fullName] = costume;
                        blocker.remove();
                        wrap.classList.remove('sttc--hover');
                        executeSlashCommandsWithOptions(`/costume ${costume}`);
                        settings.save();
                        scheduleUpdate({ immediate: true, forceImages: true });
                    });
                    const img = document.createElement('img'); {
                        img.src = url;
                        img.classList.add();
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
        const mods = {
            'c': 'ctrl',
            's': 'shift',
            'a': 'alt',
        };
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
const getExtensionsKey = () => (settings?.extensions ?? []).join(',');
const getNamePart = (fullName) => fullName.split('::')[0];
const getCostumeName = (fullName) => settings.costumes?.[getNamePart(fullName)] ?? getNamePart(fullName);
const resolveImageUrl = async (name) => {
    const cacheKey = `${name}::${settings.expression}::${getExtensionsKey()}`;
    if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
    }
    let foundUrl = null;
    for (const ext of settings.extensions) {
        const url = `/characters/${name}/${settings.expression}.${ext}`;
        const resp = await fetch(url, {
            method: 'HEAD',
            headers: getRequestHeaders(),
        });
        if (resp.ok) {
            foundUrl = url;
            break;
        }
    }
    imageCache.set(cacheKey, foundUrl);
    return foundUrl;
};
const updateCardImage = async (name, img) => {
    const target = getCostumeName(name);
    const imageKey = `${target}::${settings.expression}::${getExtensionsKey()}`;
    if (img.dataset.imageKey === imageKey) {
        return false;
    }
    img.dataset.imageKey = imageKey;
    const url = await resolveImageUrl(target);
    if (url) {
        img.src = url;
    }
    return true;
};
const updateCardState = (name, presentSet, mutedSet) => {
    const img = imgsByName.get(name);
    if (!img) return false;
    let changed = false;
    const wrap = img.closest('.sttc--wrapper');
    const isPresent = presentSet.has(name);
    const isMuted = mutedSet.has(name);
    if (settings.grayscale && !isPresent) {
        changed = changed || !wrap.classList.contains('sttc--absent');
        wrap.classList.add('sttc--absent');
    } else {
        changed = changed || wrap.classList.contains('sttc--absent');
        wrap.classList.remove('sttc--absent');
    }
    if (settings.mute && !isMuted) {
        changed = changed || !wrap.classList.contains('sttc--chatty');
        wrap.classList.add('sttc--chatty');
    } else {
        changed = changed || wrap.classList.contains('sttc--chatty');
        wrap.classList.remove('sttc--chatty');
    }
    return changed;
};
const addCard = async (name) => {
    const namePart = getNamePart(name);
    if (settings.costumes?.[namePart]) {
        executeSlashCommandsWithOptions(`/costume ${settings.costumes[namePart]}`);
    }
    const wrap = document.createElement('div'); {
        wrap.classList.add('sttc--wrapper');
        wrap.addEventListener('click', (evt)=>handleClick(evt, name));
        wrap.addEventListener('contextmenu', (evt)=>handleContext(evt, name, wrap));
        wrap.addEventListener('pointerenter', ()=>handleTitle(wrap, name));
        const img = document.createElement('img'); {
            img.classList.add('sttc--img');
            img.setAttribute('data-character', name);
            const url = await resolveImageUrl(settings.costumes?.[namePart] ?? namePart);
            if (url) {
                img.src = url;
            }
            wrap.append(img);
            imgsByName.set(name, img);
        }
        const existing = [...imgsByName.keys()];
        const beforeName = existing.find(it=>name.localeCompare(it) == -1);
        if (beforeName) {
            const before = imgsByName.get(beforeName);
            before.closest('.sttc--wrapper').insertAdjacentElement('beforebegin', wrap);
        } else {
            root.append(wrap);
        }
    }
};
const removeCard = (name) => {
    const img = imgsByName.get(name);
    if (!img) return;
    img.closest('.sttc--wrapper')?.remove();
    imgsByName.delete(name);
};
const syncMembers = async ({ forceImages = false } = {}) => {
    if (!settings?.isEnabled || !isRunning) return false;
    const names = getNames();
    const present = new Set(getNames(true));
    const muted = new Set(getMuted());
    const namesSet = new Set(names);
    let changed = false;

    for (const existing of nameList) {
        if (!namesSet.has(existing)) {
            removeCard(existing);
            changed = true;
        }
    }

    for (const name of names) {
        if (!nameList.has(name)) {
            await addCard(name);
            changed = true;
        }
    }

    const presentKey = [...present].join('|');
    const mutedKey = [...muted].join('|');
    const presenceChanged = presentKey !== memberState.lastPresentKey;
    const mutedChanged = mutedKey !== memberState.lastMutedKey;
    if (presenceChanged || mutedChanged) {
        for (const name of namesSet) {
            changed = updateCardState(name, present, muted) || changed;
        }
    }

    const extensionsKey = getExtensionsKey();
    const costumesKey = JSON.stringify(settings.costumes ?? {});
    const imageSettingsChanged = settings.expression !== memberState.lastExpression
        || extensionsKey !== memberState.lastExtensionsKey
        || costumesKey !== memberState.lastCostumesKey
        || forceImages;
    if (imageSettingsChanged) {
        for (const name of namesSet) {
            const img = imgsByName.get(name);
            if (!img) continue;
            changed = (await updateCardImage(name, img)) || changed;
        }
    }

    nameList = namesSet;
    memberState.lastPresentKey = presentKey;
    memberState.lastMutedKey = mutedKey;
    memberState.lastExpression = settings.expression;
    memberState.lastExtensionsKey = extensionsKey;
    memberState.lastCostumesKey = costumesKey;
    return changed;
};
const queueUpdate = (options = {}) => {
    updateChain = updateChain
        .then(() => syncMembers(options))
        .catch((ex) => console.warn('[TC] Update failed', ex));
    return updateChain;
};
const schedulePoll = (delay = pollState.delay) => {
    if (!isRunning || !settings?.isEnabled) return;
    clearTimeout(pollState.timer);
    pollState.timer = setTimeout(async () => {
        const changed = await queueUpdate();
        if (changed) {
            pollState.delay = 2000;
        } else {
            pollState.delay = Math.min(Math.round(pollState.delay * 1.5), 10000);
        }
        schedulePoll(pollState.delay);
    }, delay);
};
const scheduleUpdate = ({ immediate = false, forceImages = false } = {}) => {
    if (!isRunning || !settings?.isEnabled) return;
    clearTimeout(pollState.timer);
    const delay = immediate ? 0 : 250;
    pollState.timer = setTimeout(async () => {
        await queueUpdate({ forceImages });
        pollState.delay = 2000;
        schedulePoll();
    }, delay);
};






const restart = async()=>{
    await end();
    start();
};
const restartDebounced = debounce(restart);
const start = () => {
    const form = document.querySelector('#form_sheld');
    if (!form) return;
    nameList = new Set();
    imageCache.clear();
    memberState.lastExpression = null;
    memberState.lastExtensionsKey = '';
    memberState.lastCostumesKey = '';
    memberState.lastPresentKey = '';
    memberState.lastMutedKey = '';
    form.style.position = 'relative';
    root = document.createElement('div'); {
        root.classList.add('sttc--root');
        root.addEventListener('wheel', evt=>{
            evt.preventDefault();
            root.scrollLeft += evt.deltaY;
        });
        form.append(root);
    }
    isRunning = true;
    pollState.delay = 2000;
    queueUpdate({ forceImages: true });
    schedulePoll();
};
const end = async () => {
    isRunning = false;
    clearTimeout(pollState.timer);
    pollState.timer = null;
    nameList = new Set();
    root?.remove();
    root = null;
    const form = document.querySelector('#form_sheld');
    if (form) form.style.position = '';
    imgsByName.clear();
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
