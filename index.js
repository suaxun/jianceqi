import { eventSource, event_types } from '../../../script.js';
import { extension_settings, getContext, saveSettingsDebounced } from '../../../extensions.js';

const extensionName = 'world-info-debugger';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

const defaultSettings = {
    enabled: true,
    autoEnable: true,
    maxLogs: 200
};

class WorldInfoDebugger {
    constructor() {
        this.logs = [];
        this.importCount = 0;
        this.failCount = 0;
        this.originalFunctions = {};
        this.suspiciousExtensions = new Set();
        this.settings = defaultSettings;
    }

    async init() {
        console.log('[WI Debugger] Initializing...');
        
        // Load settings
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = this.settings;
        }
        this.settings = extension_settings[extensionName];

        // Create UI - 等 DOM 完全加载
        this.createUI();
        
        // Setup hooks
        if (this.settings.enabled) {
            this.setupHooks();
            this.scanEnvironment();
        }
        
        this.log('info', 'System', '✓ World Info Import Debugger initialized');
        console.log('[WI Debugger] ✓ Initialized successfully');
    }

    createUI() {
        // 创建一个新的设置块
        const settingsHtml = `
            <div class="wi-debugger-settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>🔍 World Info Import Debugger</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <div class="wi-debugger-panel">
                            <div class="wi-debugger-header">
                                <label class="checkbox_label">
                                    <input type="checkbox" id="wi-debugger-enabled" ${this.settings.enabled ? 'checked' : ''}>
                                    <span>Enable Monitoring</span>
                                </label>
                            </div>
                            
                            <div class="wi-stats">
                                <div class="wi-stat">
                                    <div class="wi-stat-value" id="import-count">0</div>
                                    <div class="wi-stat-label">Total Imports</div>
                                </div>
                                <div class="wi-stat">
                                    <div class="wi-stat-value" id="fail-count">0</div>
                                    <div class="wi-stat-label">Failed (0 entries)</div>
                                </div>
                                <div class="wi-stat">
                                    <div class="wi-stat-value" id="extension-count">-</div>
                                    <div class="wi-stat-label">Active Extensions</div>
                                </div>
                                <div class="wi-stat">
                                    <div class="wi-stat-value" id="hook-count">0</div>
                                    <div class="wi-stat-label">Active Hooks</div>
                                </div>
                            </div>
                            
                            <div class="wi-debugger-log" id="wi-debug-log">
                                <div class="log-entry info">
                                    <span class="log-timestamp">00:00:00.000</span>
                                    <span class="log-source">[System]</span>
                                    <span class="log-message">Waiting for initialization...</span>
                                </div>
                            </div>
                            
                            <div class="wi-debugger-controls">
                                <button class="menu_button" id="wi-clear-log">Clear Log</button>
                                <button class="menu_button" id="wi-export-log">Export Log</button>
                                <button class="menu_button" id="wi-test-import">Test Current Char</button>
                                <button class="menu_button" id="wi-analyze">Deep Analysis</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 尝试多个可能的注入点
        const possibleTargets = [
            '#extensions_settings',
            '#extensions_settings2', 
            '#world_info_settings',
            '#character_world_settings',
            '.drawer-content.wide_drawer_content'
        ];

        let injected = false;
        for (const target of possibleTargets) {
            const element = $(target);
            if (element.length > 0) {
                element.append(settingsHtml);
                console.log(`[WI Debugger] UI injected into: ${target}`);
                injected = true;
                break;
            }
        }

        if (!injected) {
            // 如果都找不到，直接添加到 body
            console.warn('[WI Debugger] Could not find extension settings panel, adding to body');
            $('body').append(`<div id="wi-debugger-fallback" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999; max-width: 500px;">${settingsHtml}</div>`);
        }

        // 等待 DOM 更新后再绑定事件
        setTimeout(() => {
            this.bindUIEvents();
        }, 100);
    }

    bindUIEvents() {
        console.log('[WI Debugger] Binding UI events...');

        $('#wi-debugger-enabled').on('change', (e) => {
            this.settings.enabled = e.target.checked;
            extension_settings[extensionName] = this.settings;
            saveSettingsDebounced();
            
            if (this.settings.enabled) {
                this.setupHooks();
                this.log('success', 'System', '✓ Monitoring enabled');
            } else {
                this.log('warning', 'System', '⚠ Monitoring disabled');
            }
        });

        $('#wi-clear-log').on('click', () => {
            console.log('[WI Debugger] Clear log clicked');
            this.clearLog();
        });

        $('#wi-export-log').on('click', () => {
            console.log('[WI Debugger] Export log clicked');
            this.exportLog();
        });

        $('#wi-test-import').on('click', () => {
            console.log('[WI Debugger] Test import clicked');
            this.testCurrentCharacter();
        });

        $('#wi-analyze').on('click', () => {
            console.log('[WI Debugger] Analyze clicked');
            this.analyzeExtensions();
        });

        console.log('[WI Debugger] ✓ UI events bound');
    }

    setupHooks() {
        console.log('[WI Debugger] Setting up hooks...');

        // Hook importCharacter
        if (window.importCharacter) {
            this.hookFunction('importCharacter', window, 'importCharacter');
        }
        
        // Hook importEmbeddedWorldInfo
        if (window.importEmbeddedWorldInfo) {
            this.hookFunction('importEmbeddedWorldInfo', window, 'importEmbeddedWorldInfo');
        }

        // Hook processDroppedFiles
        if (window.processDroppedFiles) {
            this.hookFunction('processDroppedFiles', window, 'processDroppedFiles');
        }

        // Hook fetch
        this.hookFetch();

        // Listen to events
        eventSource.on(event_types.CHARACTER_IMPORTED, (data) => {
            this.log('info', 'Event', `Character imported event fired`);
            setTimeout(() => this.checkWorldInfo(), 500);
        });

        this.updateHookCount();
        console.log('[WI Debugger] ✓ Hooks installed');
    }

    hookFunction(name, obj, key) {
        if (typeof obj[key] !== 'function') {
            this.log('warning', 'Hook', `Cannot hook ${name}: not a function`);
            return;
        }

        const original = obj[key];
        this.originalFunctions[name] = original;

        const self = this;
        obj[key] = async function(...args) {
            const startTime = performance.now();
            self.log('info', name, `⚡ Called`);

            try {
                const result = await original.apply(this, args);
                const duration = performance.now() - startTime;

                self.log('success', name, `✓ Completed in ${duration.toFixed(2)}ms`);

                // Special handling for world info import
                if (name === 'importEmbeddedWorldInfo') {
                    self.importCount++;
                    self.updateStats();

                    // Check if result has entries
                    if (result && typeof result === 'object') {
                        if (result.entries !== undefined) {
                            const count = Array.isArray(result.entries) ? result.entries.length : 0;
                            
                            if (count === 0) {
                                self.failCount++;
                                self.log('error', name, `⚠ IMPORT RETURNED 0 ENTRIES!`);
                                self.diagnoseFailure(args, result);
                            } else {
                                self.log('success', name, `✓ Imported ${count} entries`);
                            }
                        }
                    }
                }

                return result;
            } catch (error) {
                const duration = performance.now() - startTime;
                self.log('error', name, `✗ Failed: ${error.message} (${duration.toFixed(2)}ms)`);
                throw error;
            }
        };

        this.log('success', 'Hook', `✓ Hooked ${name}`);
    }

    hookFetch() {
        if (this.originalFetch) return; // Already hooked

        const originalFetch = window.fetch;
        this.originalFetch = originalFetch;
        const self = this;

        window.fetch = async function(url, options) {
            const shouldLog = typeof url === 'string' && (
                url.includes('worldinfo') || 
                url.includes('import') ||
                url.includes('character')
            );

            if (shouldLog) {
                const method = options?.method || 'GET';
                self.log('info', 'API', `${method} ${url.substring(url.lastIndexOf('/'))}`);

                const startTime = performance.now();
                try {
                    const response = await originalFetch(url, options);
                    const duration = performance.now() - startTime;

                    self.log(response.ok ? 'success' : 'error', 'API', 
                        `${response.status} (${duration.toFixed(0)}ms)`);

                    return response;
                } catch (error) {
                    self.log('error', 'API', `Failed: ${error.message}`);
                    throw error;
                }
            }

            return originalFetch(url, options);
        };

        this.log('success', 'Hook', '✓ Hooked fetch()');
    }

    scanEnvironment() {
        const extensionCount = Object.keys(extension_settings).length;
        $('#extension-count').text(extensionCount);
        this.log('info', 'Scan', `Found ${extensionCount} extensions`);
    }

    async checkWorldInfo() {
        const context = getContext();
        if (context.characterId === undefined) {
            this.log('warning', 'Check', 'No character selected');
            return;
        }

        try {
            const char = context.characters[context.characterId];
            this.log('info', 'Check', `Checking: ${char.name}`);

            const response = await fetch('/api/characters/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar_url: char.avatar })
            });

            if (response.ok) {
                const charData = await response.json();
                const wiData = charData.data?.character_book || charData.character_book;

                if (wiData && wiData.entries) {
                    const count = wiData.entries.length;
                    this.log(count === 0 ? 'warning' : 'success', 'Check', 
                        `Card has ${count} WI entries`);
                } else {
                    this.log('info', 'Check', 'No character_book in card');
                }
            }
        } catch (error) {
            this.log('error', 'Check', `Error: ${error.message}`);
        }
    }

    diagnoseFailure(args, result) {
        this.log('error', 'Diagnosis', '════════════════════════');
        this.log('error', 'Diagnosis', '⚠ FAILURE DETECTED');
        this.log('error', 'Diagnosis', '════════════════════════');
        
        this.log('info', 'Diagnosis', '📋 Try these steps:');
        this.log('info', 'Diagnosis', '1. Check browser console (F12)');
        this.log('info', 'Diagnosis', '2. Disable extensions one by one');
        this.log('info', 'Diagnosis', '3. Re-import the character');
        this.log('info', 'Diagnosis', '4. Verify card has WI data');

        this.updateStats();
    }

    async testCurrentCharacter() {
        this.log('info', 'Test', 'Testing current character...');
        await this.checkWorldInfo();
    }

    async analyzeExtensions() {
        this.log('info', 'Analysis', 'Analyzing extensions...');

        Object.keys(extension_settings).forEach((name) => {
            if (name === extensionName) return;

            const wiRelated = name.toLowerCase().includes('world') ||
                            name.toLowerCase().includes('lorebook') ||
                            name.toLowerCase().includes('import');

            if (wiRelated) {
                this.log('warning', 'Analysis', `⚠ ${name}`);
            }
        });

        this.log('success', 'Analysis', '✓ Complete');
    }

    log(level, source, message) {
        if (!this.settings.enabled) return;

        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            fractionalSecondDigits: 3
        });

        const entry = { timestamp, level, source, message };
        this.logs.push(entry);

        // Add to UI
        const logElement = $('#wi-debug-log');
        if (logElement.length === 0) {
            console.warn('[WI Debugger] Log element not found!');
            return;
        }

        const entryHtml = `
            <div class="log-entry ${level}">
                <span class="log-timestamp">${timestamp}</span>
                <span class="log-source">[${source}]</span>
                <span class="log-message">${message}</span>
            </div>
        `;

        logElement.append(entryHtml);
        logElement.scrollTop(logElement[0].scrollHeight);

        // Keep only last N entries
        while (this.logs.length > this.settings.maxLogs) {
            this.logs.shift();
            logElement.find('.log-entry:first').remove();
        }

        // Also console log
        console.log(`[WI-Debugger] [${source}] ${message}`);
    }

    clearLog() {
        this.logs = [];
        $('#wi-debug-log').empty();
        this.log('info', 'System', '✓ Log cleared');
    }

    exportLog() {
        const logText = this.logs.map(entry => 
            `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`
        ).join('\n');

        const header = `World Info Debugger Log
Generated: ${new Date().toISOString()}
Imports: ${this.importCount} | Failed: ${this.failCount}
Hooks: ${Object.keys(this.originalFunctions).length}
${'='.repeat(60)}

`;

        const blob = new Blob([header + logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wi-debug-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.log('success', 'Export', `✓ Exported ${this.logs.length} entries`);
    }

    updateStats() {
        $('#import-count').text(this.importCount);
        $('#fail-count').text(this.failCount);
    }

    updateHookCount() {
        $('#hook-count').text(Object.keys(this.originalFunctions).length);
    }
}

// Initialize extension
jQuery(async () => {
    console.log('[WI Debugger] jQuery ready, starting initialization...');
    
    const wiDebugger = new WorldInfoDebugger();
    await wiDebugger.init();
    
    // Export to window for console access
    window.wiDebugger = wiDebugger;
    console.log('[WI Debugger] ✓ Available as window.wiDebugger');
});
