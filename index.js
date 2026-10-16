(function() {
    'use strict';
    
    console.log('[WI Debugger] Loading...');
    
    const extensionName = 'jianceqi';
    let logs = [];
    let importCount = 0;
    let failCount = 0;
    let isEnabled = true;
    
    // 等待 SillyTavern 完全加载
    function waitForST() {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (window.SillyTavern && window.eventSource && window.extension_settings) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
    }
    
    function createUI() {
        const html = `
            <div id="wi-debugger-panel" style="
                background: #1a1a1a;
                border: 1px solid #333;
                border-radius: 8px;
                padding: 15px;
                margin: 10px 0;
            ">
                <h3 style="margin: 0 0 15px 0; color: #fff;">🔍 WI Import Debugger</h3>
                
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
                    <div style="background: #2a2a2a; padding: 10px; border-radius: 5px; text-align: center;">
                        <div id="import-count" style="font-size: 24px; color: #4CAF50;">0</div>
                        <div style="font-size: 11px; color: #999;">Total Imports</div>
                    </div>
                    <div style="background: #2a2a2a; padding: 10px; border-radius: 5px; text-align: center;">
                        <div id="fail-count" style="font-size: 24px; color: #f44336;">0</div>
                        <div style="font-size: 11px; color: #999;">Failed (0 entries)</div>
                    </div>
                    <div style="background: #2a2a2a; padding: 10px; border-radius: 5px; text-align: center;">
                        <div id="ext-count" style="font-size: 24px; color: #2196F3;">-</div>
                        <div style="font-size: 11px; color: #999;">Extensions</div>
                    </div>
                    <div style="background: #2a2a2a; padding: 10px; border-radius: 5px; text-align: center;">
                        <div id="hook-count" style="font-size: 24px; color: #FF9800;">0</div>
                        <div style="font-size: 11px; color: #999;">Hooks</div>
                    </div>
                </div>
                
                <div id="wi-log" style="
                    background: #0a0a0a;
                    border: 1px solid #333;
                    border-radius: 5px;
                    padding: 10px;
                    max-height: 300px;
                    overflow-y: auto;
                    font-family: monospace;
                    font-size: 12px;
                    margin-bottom: 10px;
                ">
                    <div style="color: #4CAF50;">[System] Debugger ready</div>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button id="wi-clear" class="menu_button">Clear</button>
                    <button id="wi-export" class="menu_button">Export</button>
                    <button id="wi-test" class="menu_button">Test Char</button>
                    <button id="wi-analyze" class="menu_button">Analyze</button>
                </div>
            </div>
        `;
        
        // 尝试找到扩展设置区域
        const targets = [
            document.getElementById('extensions_settings'),
            document.getElementById('extensions_settings2'),
            document.querySelector('.drawer-content')
        ];
        
        for (const target of targets) {
            if (target) {
                target.insertAdjacentHTML('beforeend', html);
                console.log('[WI Debugger] UI injected');
                setupButtons();
                return true;
            }
        }
        
        // 如果找不到，添加到 body
        document.body.insertAdjacentHTML('beforeend', `
            <div style="position: fixed; bottom: 20px; right: 20px; z-index: 10000; max-width: 500px;">
                ${html}
            </div>
        `);
        console.log('[WI Debugger] UI injected to body (fallback)');
        setupButtons();
        return true;
    }
    
    function setupButtons() {
        document.getElementById('wi-clear')?.addEventListener('click', () => {
            logs = [];
            document.getElementById('wi-log').innerHTML = '<div style="color: #4CAF50;">[System] Log cleared</div>';
        });
        
        document.getElementById('wi-export')?.addEventListener('click', () => {
            const text = logs.join('\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wi-debug-${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            addLog('success', 'Export', 'Log exported');
        });
        
        document.getElementById('wi-test')?.addEventListener('click', testCurrentChar);
        document.getElementById('wi-analyze')?.addEventListener('click', analyzeExtensions);
    }
    
    function addLog(level, source, message) {
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };
        
        const time = new Date().toLocaleTimeString();
        const logText = `[${time}] [${source}] ${message}`;
        logs.push(logText);
        
        const logDiv = document.getElementById('wi-log');
        if (logDiv) {
            const entry = document.createElement('div');
            entry.style.color = colors[level] || '#fff';
            entry.textContent = logText;
            logDiv.appendChild(entry);
            logDiv.scrollTop = logDiv.scrollHeight;
            
            // Keep only last 100 entries
            while (logDiv.children.length > 100) {
                logDiv.removeChild(logDiv.firstChild);
            }
        }
        
        console.log(`[WI Debugger] ${logText}`);
    }
    
    function setupHooks() {
        addLog('info', 'Hook', 'Setting up hooks...');
        
        // Hook importEmbeddedWorldInfo
        if (window.importEmbeddedWorldInfo) {
            const original = window.importEmbeddedWorldInfo;
            window.importEmbeddedWorldInfo = async function(...args) {
                const start = performance.now();
                addLog('info', 'Import', 'importEmbeddedWorldInfo called');
                
                try {
                    const result = await original.apply(this, args);
                    const duration = (performance.now() - start).toFixed(2);
                    
                    importCount++;
                    document.getElementById('import-count').textContent = importCount;
                    
                    if (result && result.entries !== undefined) {
                        const count = Array.isArray(result.entries) ? result.entries.length : 0;
                        
                        if (count === 0) {
                            failCount++;
                            document.getElementById('fail-count').textContent = failCount;
                            addLog('error', 'Import', `⚠️ RETURNED 0 ENTRIES! (${duration}ms)`);
                            diagnose();
                        } else {
                            addLog('success', 'Import', `✓ Imported ${count} entries (${duration}ms)`);
                        }
                    } else {
                        addLog('warning', 'Import', `Completed but no entries info (${duration}ms)`);
                    }
                    
                    return result;
                } catch (error) {
                    addLog('error', 'Import', `Failed: ${error.message}`);
                    throw error;
                }
            };
            addLog('success', 'Hook', '✓ Hooked importEmbeddedWorldInfo');
            document.getElementById('hook-count').textContent = '1';
        } else {
            addLog('warning', 'Hook', 'importEmbeddedWorldInfo not found');
        }
        
        // Hook fetch
        const originalFetch = window.fetch;
        window.fetch = async function(url, options) {
            if (typeof url === 'string' && (url.includes('worldinfo') || url.includes('import') || url.includes('character'))) {
                const method = options?.method || 'GET';
                addLog('info', 'API', `${method} ${url.split('/').pop()}`);
            }
            return originalFetch(url, options);
        };
        addLog('success', 'Hook', '✓ Hooked fetch');
    }
    
    function diagnose() {
        addLog('error', 'Diagnosis', '═════════════════════');
        addLog('error', 'Diagnosis', '⚠️ IMPORT FAILED');
        addLog('error', 'Diagnosis', '═════════════════════');
        addLog('info', 'Diagnosis', 'Check:');
        addLog('info', 'Diagnosis', '1. Browser console (F12)');
        addLog('info', 'Diagnosis', '2. Character card has WI?');
        addLog('info', 'Diagnosis', '3. Disable extensions one by one');
    }
    
    function testCurrentChar() {
        addLog('info', 'Test', 'Testing current character...');
        
        if (!window.getContext) {
            addLog('error', 'Test', 'getContext not available');
            return;
        }
        
        const context = window.getContext();
        if (!context || context.characterId === undefined) {
            addLog('warning', 'Test', 'No character selected');
            return;
        }
        
        const char = context.characters[context.characterId];
        addLog('info', 'Test', `Character: ${char.name}`);
        
        // Try to fetch character data
        fetch('/api/characters/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatar_url: char.avatar })
        })
        .then(r => r.json())
        .then(data => {
            const wi = data.data?.character_book || data.character_book;
            if (wi && wi.entries) {
                addLog('success', 'Test', `Card has ${wi.entries.length} WI entries`);
            } else {
                addLog('info', 'Test', 'No character_book in card');
            }
        })
        .catch(err => {
            addLog('error', 'Test', `Failed: ${err.message}`);
        });
    }
    
    function analyzeExtensions() {
        addLog('info', 'Analysis', 'Analyzing extensions...');
        
        if (!window.extension_settings) {
            addLog('error', 'Analysis', 'extension_settings not available');
            return;
        }
        
        const exts = Object.keys(window.extension_settings);
        document.getElementById('ext-count').textContent = exts.length;
        
        addLog('info', 'Analysis', `Found ${exts.length} extensions`);
        
        const wiRelated = exts.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes('world') || lower.includes('lorebook') || lower.includes('import');
        });
        
        if (wiRelated.length > 0) {
            addLog('warning', 'Analysis', `WI-related: ${wiRelated.join(', ')}`);
        }
        
        addLog('success', 'Analysis', '✓ Complete');
    }
    
    // 初始化
    waitForST().then(() => {
        console.log('[WI Debugger] SillyTavern ready, initializing...');
        
        if (createUI()) {
            setupHooks();
            
            const extCount = window.extension_settings ? Object.keys(window.extension_settings).length : 0;
            document.getElementById('ext-count').textContent = extCount;
            
            addLog('success', 'System', '✓ Debugger initialized');
            console.log('[WI Debugger] ✓ Ready');
        }
    });
    
    // 导出到全局
    window.wiDebugger = {
        addLog,
        testCurrentChar,
        analyzeExtensions,
        getLogs: () => logs
    };
    
})();
