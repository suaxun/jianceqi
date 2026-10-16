jQuery(async () => {
    'use strict';
    
    const extensionName = 'jianceqi';
    
    console.log('[WI Debugger] Loading extension...');
    
    let logs = [];
    let importCount = 0;
    let failCount = 0;
    let suspiciousExtensions = new Map();
    let callStack = [];
    
    // 等待 SillyTavern API 就绪
    function waitForAPI() {
        return new Promise((resolve) => {
            const check = () => {
                // 检查多个可能的 API 入口
                if ((window.extension_settings || window.extensionSettings) && 
                    window.eventSource && 
                    window.getContext) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }
    
    // 获取扩展设置的兼容方法
    function getExtensionSettings() {
        return window.extension_settings || 
               window.extensionSettings || 
               window.SillyTavern?.extensionSettings ||
               {};
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
            
            while (logDiv.children.length > 100) {
                logDiv.removeChild(logDiv.firstChild);
            }
        }
        
        console.log(`[WI Debugger] ${logText}`);
    }
    
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
                        
                        <div id="suspicious-panel" style="background: rgba(255,0,0,0.1); border: 1px solid #f44336; border-radius: 5px; padding: 10px; margin-bottom: 10px; display: none;">
                            <div style="color: #f44336; font-weight: bold; margin-bottom: 5px;">⚠️ 可疑扩展/脚本:</div>
                            <div id="suspicious-list" style="font-size: 12px; color: #fff;"></div>
                        </div>
                        
                        <div id="wi-log" style="background: rgba(0,0,0,0.5); border: 1px solid var(--SmartThemeBorderColor); border-radius: 5px; padding: 10px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; margin-bottom: 10px;">
                            <div style="color: #4CAF50;">[System] Waiting for initialization...</div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button id="wi-clear" class="menu_button">Clear Log</button>
                            <button id="wi-export" class="menu_button">Export Report</button>
                            <button id="wi-test" class="menu_button">Test Current Char</button>
                            <button id="wi-analyze" class="menu_button">Deep Analysis</button>
                            <button id="wi-find-culprit" class="menu_button" style="background: #f44336;">Find Culprit</button>
                            <button id="wi-list-all" class="menu_button">List All Extensions</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('#extensions_settings2').append(settingsHtml);
    console.log('[WI Debugger] UI injected');
    
    function showSuspicious() {
        if (suspiciousExtensions.size === 0) {
            $('#suspicious-panel').hide();
            return;
        }
        
        let html = '';
        suspiciousExtensions.forEach((reasons, ext) => {
            html += `<div style="margin: 5px 0; padding: 5px; background: rgba(0,0,0,0.3); border-radius: 3px;">`;
            html += `<div style="color: #FF9800; font-weight: bold;">📌 ${ext}</div>`;
            reasons.forEach(reason => {
                html += `<div style="margin-left: 15px; color: #ccc;">• ${reason}</div>`;
            });
            html += `</div>`;
        });
        
        $('#suspicious-list').html(html);
        $('#suspicious-panel').show();
    }
    
    function markSuspicious(extensionName, reason) {
        if (!suspiciousExtensions.has(extensionName)) {
            suspiciousExtensions.set(extensionName, []);
        }
        suspiciousExtensions.get(extensionName).push(reason);
        showSuspicious();
    }
    
    $('#wi-clear').on('click', () => {
        logs = [];
        suspiciousExtensions.clear();
        $('#wi-log').html('<div style="color: #4CAF50;">[System] Log cleared</div>');
        $('#suspicious-panel').hide();
    });
    
    $('#wi-export').on('click', () => {
        let report = '═══════════════════════════════════════\n';
        report += 'WI Import Debugger Report\n';
        report += `Generated: ${new Date().toISOString()}\n`;
        report += '═══════════════════════════════════════\n\n';
        
        report += `Total Imports: ${importCount}\n`;
        report += `Failed Imports: ${failCount}\n`;
        
        const settings = getExtensionSettings();
        report += `Extensions: ${Object.keys(settings).length}\n\n`;
        
        if (suspiciousExtensions.size > 0) {
            report += '⚠️ SUSPICIOUS EXTENSIONS/SCRIPTS:\n';
            report += '─────────────────────────────────────\n';
            suspiciousExtensions.forEach((reasons, ext) => {
                report += `\n📌 ${ext}\n`;
                reasons.forEach(reason => {
                    report += `   • ${reason}\n`;
                });
            });
            report += '\n';
        }
        
        report += '\n═══ INSTALLED EXTENSIONS ═══\n';
        Object.keys(settings).forEach((ext, idx) => {
            report += `${idx + 1}. ${ext}\n`;
        });
        
        report += '\n═══════════════════════════════════════\n';
        report += 'DETAILED LOG:\n';
        report += '═══════════════════════════════════════\n\n';
        report += logs.join('\n');
        
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wi-debug-report-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('success', 'Export', 'Report exported');
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
                addLog('success', 'Test', `✓ Card has ${wi.entries.length} WI entries`);
                
                // 检查实际加载的
                if (window.world_info && window.world_info.entries) {
                    const loadedCount = Object.keys(window.world_info.entries).length;
                    addLog('info', 'Test', `Currently loaded in ST: ${loadedCount} entries`);
                    
                    if (wi.entries.length > 0 && loadedCount === 0) {
                        addLog('error', 'Test', `⚠️ PROBLEM! Card has ${wi.entries.length} entries but NONE loaded!`);
                        markSuspicious('Import Process', 'Card has WI but nothing loaded into ST');
                    }
                }
            } else {
                addLog('info', 'Test', 'No character_book in card');
            }
        })
        .catch(err => {
            addLog('error', 'Test', `Failed: ${err.message}`);
        });
    });
    
    $('#wi-analyze').on('click', () => {
        analyzeExtensions(false);
    });
    
    $('#wi-list-all').on('click', () => {
        addLog('info', 'List', 'Listing all installed extensions...');
        
        const settings = getExtensionSettings();
        const exts = Object.keys(settings);
        
        if (exts.length === 0) {
            addLog('warning', 'List', 'No extensions found or unable to access extension_settings');
            addLog('info', 'List', 'Trying alternative methods...');
            
            // 尝试从 DOM 中获取扩展列表
            const extElements = document.querySelectorAll('[id^="third-party"]');
            if (extElements.length > 0) {
                addLog('info', 'List', `Found ${extElements.length} third-party extension scripts in DOM:`);
                extElements.forEach((el, idx) => {
                    const id = el.id.replace('third-party_', '').replace('-js', '');
                    addLog('info', 'List', `${idx + 1}. ${id}`);
                });
            }
        } else {
            addLog('info', 'List', `Found ${exts.length} extensions:`);
            exts.forEach((ext, idx) => {
                addLog('info', 'List', `${idx + 1}. ${ext}`);
            });
        }
    });
    
    $('#wi-find-culprit').on('click', async () => {
        addLog('info', 'Culprit', '🔍 Starting deep investigation...');
        
        // 1. 检查事件监听器
        if (window.eventSource && window.event_types) {
            addLog('info', 'Culprit', 'Checking event listeners...');
            
            const relevantEvents = [
                'CHARACTER_IMPORTED',
                'WORLDINFO_SETTINGS_UPDATED', 
                'CHARACTER_EDITED',
                'SETTINGS_LOADED_AFTER'
            ];
            
            relevantEvents.forEach(eventName => {
                const event = window.event_types[eventName];
                if (event && typeof window.eventSource.listenerCount === 'function') {
                    const count = window.eventSource.listenerCount(event);
                    if (count > 0) {
                        addLog('info', 'Culprit', `Event ${eventName}: ${count} listeners`);
                        if (count > 3) {
                            markSuspicious('Multiple Extensions', `Unusual number of ${eventName} listeners (${count})`);
                        }
                    }
                }
            });
        }
        
        // 2. 检查关键函数
        addLog('info', 'Culprit', 'Checking critical functions...');
        
        const criticalFunctions = [
            'importEmbeddedWorldInfo',
            'importCharacter', 
            'processDroppedFiles'
        ];
        
        criticalFunctions.forEach(funcName => {
            if (window[funcName]) {
                const funcStr = window[funcName].toString();
                
                // 检查是否被 hook
                if (funcStr.includes('original.apply') || funcStr.includes('original.call')) {
                    addLog('warning', 'Culprit', `⚠️ ${funcName} is wrapped/hooked`);
                    markSuspicious('Unknown Extension', `Hooked: ${funcName}`);
                }
                
                // 检查函数长度（过长可能被修改）
                if (funcStr.length > 5000) {
                    addLog('warning', 'Culprit', `${funcName} has unusually large code (${funcStr.length} chars)`);
                }
            } else {
                addLog('warning', 'Culprit', `${funcName} not found in window object`);
            }
        });
        
        // 3. 检查全局污染
        addLog('info', 'Culprit', 'Checking for global modifications...');
        const globalProps = Object.keys(window);
        const suspicious = globalProps.filter(prop => {
            return (prop.startsWith('ext_') || 
                   prop.startsWith('plugin_') ||
                   prop.startsWith('stscript_')) &&
                   (prop.toLowerCase().includes('world') || 
                    prop.toLowerCase().includes('import'));
        });
        
        if (suspicious.length > 0) {
            addLog('warning', 'Culprit', `Found suspicious globals: ${suspicious.join(', ')}`);
            suspicious.forEach(prop => {
                markSuspicious('Global Pollution', `Suspicious global: ${prop}`);
            });
        }
        
        // 4. 分析扩展
        analyzeExtensions(true);
        
        // 5. 检查 DOM 中的扩展脚本
        addLog('info', 'Culprit', 'Checking loaded extension scripts...');
        const scripts = document.querySelectorAll('script[src*="extensions"]');
        addLog('info', 'Culprit', `Found ${scripts.length} extension scripts loaded`);
        
        addLog('success', 'Culprit', '✓ Investigation complete');
        
        if (suspiciousExtensions.size === 0) {
            addLog('info', 'Culprit', 'No obvious culprit found - check the log above for clues');
        }
    });
    
    function analyzeExtensions(deep = false) {
        addLog('info', 'Analysis', 'Analyzing extensions...');
        
        const settings = getExtensionSettings();
        const exts = Object.keys(settings);
        
        if (exts.length === 0) {
            addLog('warning', 'Analysis', 'Cannot access extension_settings');
            addLog('info', 'Analysis', 'Click "List All Extensions" to see loaded extensions');
            return;
        }
        
        $('#ext-count').text(exts.length);
        addLog('info', 'Analysis', `Found ${exts.length} extensions`);
        
        // WI 相关扩展
        const wiRelated = exts.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes('world') || 
                   lower.includes('lorebook') || 
                   lower.includes('import') ||
                   lower.includes('character') ||
                   lower.includes('book');
        });
        
        if (wiRelated.length > 0) {
            addLog('warning', 'Analysis', `WI-related extensions (${wiRelated.length}):`);
            wiRelated.forEach(ext => {
                addLog('warning', 'Analysis', `  • ${ext}`);
                markSuspicious(ext, 'Name suggests WI functionality');
            });
        }
        
        if (deep) {
            addLog('info', 'Analysis', 'Deep analysis mode...');
            
            exts.forEach(extName => {
                const extSettings = settings[extName];
                if (extSettings && typeof extSettings === 'object') {
                    const keys = Object.keys(extSettings);
                    const suspiciousKeys = keys.filter(key => {
                        const lower = key.toLowerCase();
                        return lower.includes('world') || 
                               lower.includes('import') ||
                               lower.includes('hook') ||
                               lower.includes('intercept');
                    });
                    
                    if (suspiciousKeys.length > 0) {
                        addLog('warning', 'Analysis', `${extName}: ${suspiciousKeys.join(', ')}`);
                        markSuspicious(extName, `Settings: ${suspiciousKeys.join(', ')}`);
                    }
                }
            });
        }
        
        addLog('success', 'Analysis', '✓ Complete');
    }
    
    function setupHooks() {
        addLog('info', 'Hook', 'Setting up hooks...');
        let hookCount = 0;
        
        if (window.importEmbeddedWorldInfo) {
            const original = window.importEmbeddedWorldInfo;
            window.importEmbeddedWorldInfo = async function(...args) {
                const start = performance.now();
                const stack = new Error().stack;
                
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
                            addLog('error', 'Import', `⚠️ RETURNED 0 ENTRIES! (${duration}ms)`);
                            
                            // 分析调用栈
                            const lines = stack.split('\n');
                            const extPaths = lines.filter(line => line.includes('/extensions/'));
                            if (extPaths.length > 0) {
                                addLog('info', 'Import', 'Extensions in call stack:');
                                extPaths.forEach(line => {
                                    const match = line.match(/extensions\/(?:third-party\/)?([^\/\?]+)/);
                                    if (match && match[1] !== extensionName) {
                                        addLog('warning', 'Import', `  • ${match[1]}`);
                                        markSuspicious(match[1], 'In import call stack');
                                    }
                                });
                            }
                            
                            diagnose();
                        } else {
                            addLog('success', 'Import', `✓ ${count} entries (${duration}ms)`);
                        }
                    }
                    
                    return result;
                } catch (error) {
                    addLog('error', 'Import', `✗ ${error.message}`);
                    throw error;
                }
            };
            addLog('success', 'Hook', '✓ Hooked importEmbeddedWorldInfo');
            hookCount++;
        } else {
            addLog('warning', 'Hook', '⚠️ importEmbeddedWorldInfo not found');
        }
        
        $('#hook-count').text(hookCount);
    }
    
    function diagnose() {
        addLog('error', 'Diagnosis', '═══════════════════════════');
        addLog('error', 'Diagnosis', '⚠️ IMPORT FAILURE');
        addLog('error', 'Diagnosis', '═══════════════════════════');
        
        if (suspiciousExtensions.size > 0) {
            addLog('error', 'Diagnosis', '');
            addLog('error', 'Diagnosis', '🎯 Likely culprits:');
            suspiciousExtensions.forEach((reasons, ext) => {
                addLog('error', 'Diagnosis', `  📌 ${ext}`);
            });
            addLog('info', 'Diagnosis', '');
            addLog('info', 'Diagnosis', '💡 Try disabling these extensions one by one');
        } else {
            addLog('info', 'Diagnosis', 'Click "Find Culprit" for deeper analysis');
        }
    }
    
    // 等待 API 就绪后初始化
    await waitForAPI();
    
    setupHooks();
    
    const settings = getExtensionSettings();
    $('#ext-count').text(Object.keys(settings).length);
    
    addLog('success', 'System', '✓ Debugger ready');
    console.log('[WI Debugger] ✓ Loaded');
    
    window.wiDebugger = {
        logs,
        suspicious: suspiciousExtensions,
        listAll: () => $('#wi-list-all').click(),
        findCulprit: () => $('#wi-find-culprit').click()
    };
});
