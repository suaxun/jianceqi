import { eventSource, event_types } from '../../../script.js';
import { extension_settings, getContext, saveSettingsDebounced } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

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
        // Load settings
        if (!extension_settings[extensionName]) {
            extension_settings[extensionName] = this.settings;
        }
        this.settings = extension_settings[extensionName];

        // Create UI
        this.createUI();
        
        // Setup hooks
        if (this.settings.enabled) {
            this.setupHooks();
            this.scanEnvironment();
        }
        
        this.log('info', 'System', 'World Info Import Debugger initialized');
    }

    createUI() {
        const html = `
            <div id="wi-debugger-container" class="wi-debugger-panel">
                <div class="wi-debugger-header">
                    <h3>🔍 World Info Import Debugger</h3>
                    <label>
                        <input type="checkbox" id="wi-debugger-enabled" ${this.settings.enabled ? 'checked' : ''}>
                        Enable Monitoring
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
                
                <div class="wi-debugger-log" id="wi-debug-log"></div>
                
                <div class="wi-debugger-controls">
                    <button class="menu_button" id="wi-clear-log">Clear Log</button>
                    <button class="menu_button" id="wi-export-log">Export Log</button>
                    <button class="menu_button" id="wi-test-import">Test Current Char</button>
                    <button class="menu_button" id="wi-analyze">Deep Analysis</button>
                </div>
            </div>
        `;

        // Add to extensions panel
        $('#extensions_settings2').append(html);

        // Setup event listeners
        $('#wi-debugger-enabled').on('change', (e) => {
            this.settings.enabled = e.target.checked;
            extension_settings[extensionName] = this.settings;
            saveSettingsDebounced();
            
            if (this.settings.enabled) {
                this.setupHooks();
                this.log('success', 'System', 'Monitoring enabled');
            } else {
                this.log('warning', 'System', 'Monitoring disabled');
            }
        });

        $('#wi-clear-log').on('click', () => this.clearLog());
        $('#wi-export-log').on('click', () => this.exportLog());
        $('#wi-test-import').on('click', () => this.testCurrentCharacter());
        $('#wi-analyze').on('click', () => this.analyzeExtensions());
    }

    setupHooks() {
        // Hook importCharacter
        this.hookFunction('importCharacter', window, 'importCharacter');
        
        // Hook importEmbeddedWorldInfo
        if (window.importEmbeddedWorldInfo) {
            this.hookFunction('importEmbeddedWorldInfo', window, 'importEmbeddedWorldInfo');
        }

        // Hook processDroppedFiles
        if (window.processDroppedFiles) {
            this.hookFunction('processDroppedFiles', window, 'processDroppedFiles');
        }

        // Hook fetch for world info related requests
        this.hookFetch();

        // Listen to events
        eventSource.on(event_types.CHARACTER_IMPORTED, (data) => {
            this.log('info', 'Event', `Character imported event fired`);
            setTimeout(() => this.checkWorldInfo(), 500);
        });

        eventSource.on(event_types.WORLDINFO_SETTINGS_UPDATED, () => {
            this.log('info', 'Event', 'World Info settings updated');
        });

        this.updateHookCount();
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
                self.log('error', name, `✗ Failed after ${duration.toFixed(2)}ms: ${error.message}`);
                self.log('error', 'Stack', error.stack);
                throw error;
            }
        };

        this.log('success', 'Hook', `Hooked ${name}`);
    }

    hookFetch() {
        const originalFetch = window.fetch;
        const self = this;

        window.fetch = async function(url, options) {
            const shouldLog = typeof url === 'string' && (
                url.includes('worldinfo') || 
                url.includes('import') ||
                url.includes('character')
            );

            if (shouldLog) {
                const method = options?.method || 'GET';
                self.log('info', 'API', `${method} ${url}`);

                const startTime = performance.now();
                try {
                    const response = await originalFetch(url, options);
                    const duration = performance.now() - startTime;

                    self.log(response.ok ? 'success' : 'error', 'API', 
                        `${response.status} in ${duration.toFixed(2)}ms`);

                    // Try to read world info data
                    if (response.ok && url.includes('worldinfo')) {
                        const clone = response.clone();
                        try {
                            const data = await clone.json();
                            if (data.entries !== undefined) {
                                const count = Array.isArray(data.entries) ? data.entries.length : 0;
                                self.log('info', 'API', `Response has ${count} WI entries`);
                            }
                        } catch (e) {
                            // Response not JSON or already consumed
                        }
                    }

                    return response;
                } catch (error) {
                    const duration = performance.now() - startTime;
                    self.log('error', 'API', `Request failed: ${error.message} (${duration.toFixed(2)}ms)`);
                    throw error;
                }
            }

            return originalFetch(url, options);
        };

        this.log('success', 'Hook', 'Hooked fetch()');
    }

    scanEnvironment() {
        // Count extensions
        const extensionCount = Object.keys(extension_settings).length;
        $('#extension-count').text(extensionCount);

        this.log('info', 'Scan', `Found ${extensionCount} extensions installed`);

        // List extensions that might affect world info
        const wiRelatedExtensions = Object.keys(extension_settings).filter(ext => {
            const lower = ext.toLowerCase();
            return lower.includes('world') || 
                   lower.includes('lorebook') || 
                   lower.includes('import') ||
                   lower.includes('character');
        });

        if (wiRelatedExtensions.length > 0) {
            this.log('warning', 'Scan', `WI-related extensions: ${wiRelatedExtensions.join(', ')}`);
        }

        // Check for suspicious global modifications
        this.checkGlobalModifications();
    }

    checkGlobalModifications() {
        const props = Object.getOwnPropertyNames(window);
        const suspicious = props.filter(prop => {
            return (prop.startsWith('ext_') || 
                   prop.startsWith('plugin_')) &&
                   (prop.includes('world') || 
                   prop.includes('import') ||
                   prop.includes('lorebook'));
        });

        if (suspicious.length > 0) {
            this.log('warning', 'Scan', `Suspicious globals: ${suspicious.join(', ')}`);
        }
    }

    async checkWorldInfo() {
        const context = getContext();
        if (context.characterId === undefined) {
            this.log('warning', 'Check', 'No character selected');
            return;
        }

        try {
            const char = context.characters[context.characterId];
            
            this.log('info', 'Check', `Checking WI for: ${char.name}`);

            // Check if character has embedded world info
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
                        `Character card contains ${count} WI entries`);
                    
                    if (count === 0) {
                        this.log('info', 'Check', 'This might be normal if character has no embedded WI');
                    }
                } else {
                    this.log('info', 'Check', 'No character_book field found in card');
                }
            }
        } catch (error) {
            this.log('error', 'Check', `Failed: ${error.message}`);
        }
    }

    diagnoseFailure(args, result) {
        this.log('error', 'Diagnosis', '═══════════════════════════════');
        this.log('error', 'Diagnosis', '⚠ IMPORT FAILURE DETECTED ⚠');
        this.log('error', 'Diagnosis', '═══════════════════════════════');

        // Check for hooked functions
        this.log('info', 'Diagnosis', 'Checking for function modifications...');
        
        let hookCount = 0;
        Object.keys(this.originalFunctions).forEach(funcName => {
            const current = window[funcName];
            const original = this.originalFunctions[funcName];
            
            if (current && original && current.toString().length !== original.toString().length) {
                this.log('warning', 'Diagnosis', `  ⚠ ${funcName} appears modified`);
                hookCount++;
            }
        });

        if (hookCount === 0) {
            this.log('success', 'Diagnosis', '  ✓ No suspicious function modifications detected');
        }

        // Check event listener counts
        this.log('info', 'Diagnosis', 'Checking event listeners...');
        const eventCounts = {};
        
        [event_types.CHARACTER_IMPORTED, 
         event_types.WORLDINFO_SETTINGS_UPDATED,
         event_types.CHARACTER_EDITED].forEach(eventType => {
            const count = eventSource.listenerCount(eventType);
            if (count > 0) {
                eventCounts[eventType] = count;
                if (count > 3) {
                    this.log('warning', 'Diagnosis', `  ⚠ ${eventType}: ${count} listeners (high)`);
                }
            }
        });

        // Recommendations
        this.log('info', 'Diagnosis', '');
        this.log('info', 'Diagnosis', '📋 Recommended Actions:');
        this.log('info', 'Diagnosis', '1. Check browser console (F12) for errors');
        this.log('info', 'Diagnosis', '2. Try disabling extensions one by one');
        this.log('info', 'Diagnosis', '3. Import the character again');
        this.log('info', 'Diagnosis', '4. Check if character card actually has WI data');
        this.log('info', 'Diagnosis', '5. Try with a fresh character from internet');

        this.updateStats();
    }

    async testCurrentCharacter() {
        this.log('info', 'Test', 'Testing current character...');
        await this.checkWorldInfo();
    }

    async analyzeExtensions() {
        this.log('info', 'Analysis', 'Starting deep extension analysis...');

        // List all extensions with their settings
        Object.entries(extension_settings).forEach(([name, settings]) => {
            if (name === extensionName) return; // Skip self

            const wiRelated = name.toLowerCase().includes('world') ||
                            name.toLowerCase().includes('lorebook') ||
                            name.toLowerCase().includes('import');

            if (wiRelated) {
                this.log('warning', 'Analysis', `${name} - WI-related extension`);
            }

            // Check settings for WI-related keys
            if (settings && typeof settings === 'object') {
                const keys = Object.keys(settings);
                const suspiciousKeys = keys.filter(key => 
                    key.toLowerCase().includes('world') ||
                    key.toLowerCase().includes('lorebook') ||
                    key.toLowerCase().includes('import')
                );

                if (suspiciousKeys.length > 0) {
                    this.log('info', 'Analysis', `  └─ Has WI settings: ${suspiciousKeys.join(', ')}`);
                }
            }
        });

        this.log('success', 'Analysis', 'Analysis complete - check logs above');
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

        // Also log to console for debugging
        console.log(`[WI-Debugger] [${source}] ${message}`);
    }

    clearLog() {
        this.logs = [];
        $('#wi-debug-log').empty();
        this.log('info', 'System', 'Log cleared');
    }

    exportLog() {
        const logText = this.logs.map(entry => 
            `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`
        ).join('\n');

        const header = `
World Info Import Debugger Log
Generated: ${new Date().toISOString()}
Total Imports: ${this.importCount}
Failed Imports: ${this.failCount}
Active Hooks: ${Object.keys(this.originalFunctions).length}
Extensions: ${Object.keys(extension_settings).length}

${'='.repeat(80)}

`;

        const fullLog = header + logText;

        const blob = new Blob([fullLog], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wi-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.log('success', 'Export', `Log exported: ${this.logs.length} entries`);
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
    const debugger = new WorldInfoDebugger();
    await debugger.init();
    
    // Export to window for console access
    window.wiDebugger = debugger;
    console.log('World Info Debugger loaded. Access via: window.wiDebugger');
});
