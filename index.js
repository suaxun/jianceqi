// 使用 ST 的标准扩展模式
jQuery(async () => {
    'use strict';
    
    const extensionName = 'jianceqi';
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;
    
    console.log('[WI Debugger] Loading extension...');
    
    let logs = [];
    let importCount = 0;
    let failCount = 0;
    
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
            
            // Keep only last 100
            while (logDiv.children.length > 100) {
                logDiv.removeChild(logDiv.firstChild);
            }
        }
        
        console.log(`[WI Debugger] ${logText}`);
    }
    
    // 创建设置 HTML (参考 ST 的扩展设置模板)
    const settingsHtml = `
        <div class="wi-debugger-container">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>🔍 WI Import Debugger</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div style="background: var(--SmartThemeBlurTintColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 10px; padding: 15px;">
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
                            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; text-align: center;">
                                <div id="import-count" style="font-size: 24px; font-weight: bold; color: #4CAF50;">0</div>
                                <div style="font-size: 11px; color: #999;">Imports</div>
                            </div>
                            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; text-align: center;">
                                <div id="fail-count" style="font-size: 24px; font-weight: bold; color: #f44336;">0</div>
                                <div style="font-size: 11px; color: #999;">Failed</div>
                            </div>
                            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; text-align: center;">
                                <div id="ext-count" style="font-size: 24px; font-weight: bold; color: #2196F3;">-</div>
                                <div style="font-size: 11px; color: #999;">Extensions</div>
                            </div>
                            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; text-align: center;">
                                <div id="hook-count" style="font-size: 24px; font-weight: bold; color: #FF9800;">0</div>
                                <div style="font-size: 11px; color: #999;">Hooks</div>
                            </div>
                        </div>
                        
                        <div id="wi-log" style="background: rgba(0,0,0,0.5); border: 1px solid var(--SmartThemeBorderColor); border-radius: 5px; padding: 10px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; margin-bottom: 10px;">
                            <div style="color: #4CAF50;">[System] Waiting for initialization...</div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button id="wi-clear" class="menu_button">Clear Log</button>
                            <button id="wi-export" class="menu_button">Export Log</button>
                            <button id="wi-test" class="menu_button">Test Current Char</button>
                            <button id="wi-analyze" class="menu_button">Analyze Extensions</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 注入到扩展设置面板 (参考其他扩展的做法)
    $('#extensions_settings2').append(settingsHtml);
    console.log('[WI Debugger] UI injected into extensions panel');
    
    // 绑定按钮事件
    $('#wi-clear').on('click', () => {
        logs = [];
        $('#wi-log').html('<div style="color: #4CAF50;">[System] Log cleared</div>');
    });
    
    $('#wi-export').on('click', () => {
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
    
    $('#wi-test').on('click', () => {
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
                addLog('info', 'Test', 'No character_book found in card');
            }
        })
        .catch(err => {
            addLog('error', 'Test', `Failed: ${err.message}`);
        });
    });
    
    $('#wi-analyze').on('click', () => {
        addLog('info', 'Analysis', 'Analyzing extensions...');
        
        if (!window.extension_settings) {
            addLog('error', 'Analysis', 'extension_settings not available');
            return;
        }
        
        const exts = Object.keys(window.extension_settings);
        $('#ext-count').text(exts.length);
        
        addLog('info', 'Analysis', `Found ${exts.length} extensions total`);
        
        const wiRelated = exts.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes('world') || lower.includes('lorebook') || lower.includes('import');
        });
        
        if (wiRelated.length > 0) {
            addLog('warning', 'Analysis', `WI-related extensions:`);
            wiRelated.forEach(ext => addLog('warning', 'Analysis', `  - ${ext}`));
        } else {
            addLog('info', 'Analysis', 'No WI-related extensions found');
        }
        
        addLog('success', 'Analysis', '✓ Analysis complete');
    });
    
    // Setup hooks
    function setupHooks() {
        addLog('info', 'Hook', 'Setting up function hooks...');
        let hookCount = 0;
        
        // Hook importEmbeddedWorldInfo
        if (window.importEmbeddedWorldInfo) {
            const original = window.importEmbeddedWorldInfo;
            window.importEmbeddedWorldInfo = async function(...args) {
                const start = performance.now();
                addLog('info', 'Import', '⚡ importEmbeddedWorldInfo called');
                
                try {
                    const result = await original.apply(this, args);
                    const duration = (performance.now() - start).toFixed(2);
                    
                    importCount++;
                    $('#import-count').text(importCount);
                    
                    if (result && result.entries !== undefined) {
                        const count = Array.isArray(result.entries) ? result.entries.length : 0;
                        
                        if (count === 0) {
                            failCount++;
                            $('#fail-count').text(failCount);
                            addLog('error', 'Import', `⚠️ RETURNED 0 ENTRIES! Duration: ${duration}ms`);
                            diagnose();
                        } else {
                            addLog('success', 'Import', `✓ Imported ${count} entries (${duration}ms)`);
                        }
                    } else {
                        addLog('warning', 'Import', `Completed but no entry count available (${duration}ms)`);
                    }
                    
                    return result;
                } catch (error) {
                    addLog('error', 'Import', `✗ Failed: ${error.message}`);
                    console.error('[WI Debugger] Import error:', error);
                    throw error;
                }
            };
            addLog('success', 'Hook', '✓ Hooked importEmbeddedWorldInfo');
            hookCount++;
        } else {
            addLog('warning', 'Hook', '⚠️ importEmbeddedWorldInfo not found');
        }
        
        // Hook fetch for API monitoring
        const originalFetch = window.fetch;
        window.fetch = async function(url, options) {
            if (typeof url === 'string' && (url.includes('worldinfo') || url.includes('import') || url.includes('character'))) {
                const method = options?.method || 'GET';
                const endpoint = url.split('/').pop();
                addLog('info', 'API', `${method} /${endpoint}`);
            }
            return originalFetch(url, options);
        };
        addLog('success', 'Hook', '✓ Hooked fetch()');
        hookCount++;
        
        $('#hook-count').text(hookCount);
    }
    
    function diagnose() {
        addLog('error', 'Diagnosis', '═══════════════════════════');
        addLog('error', 'Diagnosis', '⚠️ IMPORT FAILURE DETECTED');
        addLog('error', 'Diagnosis', '═══════════════════════════');
        addLog('info', 'Diagnosis', '');
        addLog('info', 'Diagnosis', '📋 Troubleshooting steps:');
        addLog('info', 'Diagnosis', '1. Open browser console (F12) and check for errors');
        addLog('info', 'Diagnosis', '2. Verify the character card actually contains WI data');
        addLog('info', 'Diagnosis', '3. Try disabling extensions one by one');
        addLog('info', 'Diagnosis', '4. Re-import the character after disabling extensions');
        addLog('info', 'Diagnosis', '5. Check the "Analyze Extensions" button results');
        addLog('info', 'Diagnosis', '');
        
        // Auto-run analysis
        setTimeout(() => {
            $('#wi-analyze').click();
        }, 500);
    }
    
    // 初始化
    setupHooks();
    
    if (window.extension_settings) {
        const extCount = Object.keys(window.extension_settings).length;
        $('#ext-count').text(extCount);
    }
    
    addLog('success', 'System', '✓ WI Import Debugger initialized');
    console.log('[WI Debugger] ✓ Extension loaded successfully');
    
    // 导出到全局供控制台调用
    window.wiDebugger = {
        addLog,
        logs,
        clear: () => $('#wi-clear').click(),
        export: () => $('#wi-export').click(),
        test: () => $('#wi-test').click(),
        analyze: () => $('#wi-analyze').click()
    };
    
    console.log('[WI Debugger] Access via: window.wiDebugger');
});
