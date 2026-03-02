import { chat_metadata, getRequestHeaders } from '../../../../../script.js';
import { getContext, saveMetadataDebounced } from '../../../../extensions.js';
import { delay } from '../../../../utils.js';
import { quickReplyApi } from '../../../quick-reply/index.js';
import { groupId } from '../index.js';
import { ActionSetting } from './settings/ActionSetting.js';
import { BaseSetting } from './settings/BaseSetting.js';
import { CheckboxSetting } from './settings/CheckboxSetting.js';
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
    /**@type {string} */ expression = 'joy';
    /**@type {string[]} */ extensions = ['png', 'webp', 'gif'];
    /**@type {boolean} */ grayscale = true;
    /**@type {boolean} */ mute = true;
    /**@type {boolean} */ isCollapsed = false;
    /**@type {{[index:string]:string}} */ costumes = {};

    /**@type {BaseSetting[]}*/ settingList = [];
    /** @type {string | null} */ spriteManagerCharacter = null;
    get isActive() {
        return this.dom.classList.contains('sttc--active');
    }


    /**@type {()=>void} */ onRestart;


    /**@type {HTMLElement}*/ dom;
    /**@type {HTMLElement}*/ parent;

    constructor() {
        Object.assign(this, chat_metadata.triggerCards ?? {});
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
            costumes: this.costumes,
        };
    }

    load() {
        Object.assign(this, chat_metadata.triggerCards ?? {});
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
                                expression: 'joy',
                                extensions: ['png', 'webp', 'gif'],
                                grayscale: true,
                                mute: true,
                                isCollapsed: false,
                                costumes: {},
                            });
                            this.registerSettings();
                            await this.init();
                            this.show();
                            this.save(true);
                        },
                    }),
                ],
            }));
        }
        { // actions
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
        }
        { // members
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
        }
        { // images
            this.settingList.push(SelectSetting.fromProps({ id: 'sttc--expression',
                name: 'Expressions',
                description: 'Character expression to use for trigger card.',
                category: ['Images'],
                initialValue: this.expression,
                optionList: [
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
                ].map(it=>({ value:it, label:it })),
                onChange: (it)=>{
                    this.expression = it.value;
                    this.save();
                },
            }));
            this.settingList.push(TextSetting.fromProps({ id: 'sttc--extensions',
                name: 'Extensions',
                description: 'Comma separated list of file extensions to use for expression images.',
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
                name: 'Highlight Unmuted',
                description: 'Show unmuted members opaque.',
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
                initialValue: this.isCollapsed,
                onChange: (it)=>{
                    this.isCollapsed = it.value;
                    this.save();
                },
            }));
        }
        { // sprite manager
            this.settingList.push(CustomSetting.fromProps({
                id: 'sttc--spriteManager',
                name: 'Sprite Manager',
                description: 'Manage Trigger Cards custom sprites stored in the selected character sprite folder.',
                category: ['Sprite Manager'],
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

    async fetchSprites(characterName) {
        const res = await fetch(`/api/sprites/get?name=${encodeURIComponent(characterName)}`, {
            headers: getRequestHeaders(),
        });
        if (!res.ok) return [];
        return await res.json();
    }

    async renderSpriteRows(content, characterName) {
        content.innerHTML = '';
        if (!characterName) {
            content.textContent = 'Select a character to manage Trigger Cards sprites.';
            return;
        }

        const extension = this.getCharacterExtensions(characterName);
        const overrides = extension.spriteOverrides ?? {};
        const sprites = await this.fetchSprites(characterName);
        const cards = this.getCardEntriesForCharacter(characterName, overrides);

        if (!cards.length) {
            content.textContent = 'No Trigger Cards found. Configure Members first.';
            return;
        }

        for (const cardKey of cards) {
            const spriteName = `tc_${this.safeKey(cardKey)}`;
            const overrideLabel = overrides[cardKey];
            const activeLabel = overrideLabel ?? String(this.expression ?? '').toLowerCase();
            const matches = sprites.filter(s => String(s.label).toLowerCase() === String(activeLabel).toLowerCase());
            const preview = matches[0]?.path ?? '';

            const row = document.createElement('div');
            row.classList.add('sttc--sprite-row');

            const info = document.createElement('div');
            info.classList.add('sttc--sprite-info');
            const title = document.createElement('div');
            title.classList.add('sttc--sprite-name');
            title.textContent = cardKey;
            const source = document.createElement('div');
            source.classList.add('sttc--sprite-source');
            source.textContent = overrideLabel
                ? `Using custom sprite (${overrideLabel})`
                : `Using emotion sprite (${this.expression})`;
            info.append(title, source);

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
                const form = new FormData();
                form.append('name', characterName);
                form.append('label', spriteName);
                form.append('spriteName', spriteName);
                form.append('file', file);
                const headers = getRequestHeaders();
                delete headers['Content-Type'];
                delete headers['content-type'];
                const response = await fetch('/api/sprites/upload', {
                    method: 'POST',
                    headers,
                    body: form,
                });
                if (!response.ok) {
                    toastr.error(`Upload failed: ${response.status}`);
                    return;
                }
                const next = { ...overrides, [cardKey]: spriteName };
                await this.saveCharacterExtensions(characterName, { ...extension, spriteOverrides: next });
                this.save(true);
                await this.renderSpriteRows(content, characterName);
            });

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.classList.add('menu_button');
            remove.textContent = 'Remove custom';
            remove.style.display = overrideLabel ? '' : 'none';
            remove.addEventListener('click', async () => {
                const response = await fetch('/api/sprites/delete', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ name: characterName, label: spriteName, spriteName }),
                });
                if (!response.ok && response.status !== 404) {
                    toastr.error(`Delete failed: ${response.status}`);
                    return;
                }
                const next = { ...overrides };
                delete next[cardKey];
                await this.saveCharacterExtensions(characterName, { ...extension, spriteOverrides: next });
                this.save(true);
                await this.renderSpriteRows(content, characterName);
            });

            controls.append(fileInput, choose, fileLabel, upload, remove);
            row.append(img, info, controls);
            content.append(row);
        }
    }

    renderSpriteManager() {
        const wrap = document.createElement('div');
        wrap.classList.add('sttc--sprite-manager');
        const context = getContext();
        const chars = context.characters.map(c => c.name).filter(Boolean);

        const select = document.createElement('select');
        select.classList.add('text_pole');
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
        this.spriteManagerCharacter ??= context.characters[context.characterId]?.name ?? '';
        if (this.spriteManagerCharacter) select.value = this.spriteManagerCharacter;

        const content = document.createElement('div');
        content.classList.add('sttc--sprite-manager-list');

        select.addEventListener('change', async () => {
            this.spriteManagerCharacter = select.value || null;
            await this.renderSpriteRows(content, this.spriteManagerCharacter);
        });

        wrap.append(select, content);
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
                        head.textContent = key;
                        block.append(head);
                    }
                }
                const catBlock = /**@type {HTMLElement}*/(block.cloneNode(true));
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
        this.dom.style.bottom = `calc(100dvh + 50px - ${document.querySelector('#form_sheld').getBoundingClientRect().top}px`;
        await delay(200);
        this.updateCategory();
        this.dom.querySelector('.search').select();
    }
    hide() {
        this.dom.classList.remove('sttc--active');
        this.dom.remove();
    }
    async toggle(parent) {
        if (this.isActive) {
            this.hide();
        } else {
            await this.show(parent);
        }
    }
}
