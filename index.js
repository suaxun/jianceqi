jQuery(async () => {
    'use strict';
    
    const extensionName = 'jianceqi';
    
    console.log('[WI Debugger] Loading extension...');
    
    let logs = [];
    let importCount = 0;
    let failCount = 0;
    let suspiciousExtensions = new Map();
    let suspiciousScripts = new Map(); // 新增：记录可疑的 STscript
    let callStack = [];
    
    function waitForAPI() {
        return new Promise((resolve) => {
            const check = () => {
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
                                <div id="script-count" style="font-size: 24px; font-weight: bold; color: #9C27B0;">-</div>
                                <div style="font-size: 11px; color: #999;">STscripts</div>
                            </div>
                        </div>
                        
                        <div id="suspicious-panel" style="background: rgba(255,0,0,0.1); border: 1px solid #f44336; border-radius: 5px; padding: 10px; margin-bottom: 10px; display: none;">
                            <div style="color: #f44336; font-weight: bold; margin-bottom: 5px;">⚠️ 可疑扩展:</div>
                            <div id="suspicious-list" style="font-size: 12px; color: #fff; margin-bottom: 10px;"></div>
                            <div id="suspicious-scripts-header" style="color: #f44336; font-weight: bold; margin: 10px 0 5px 0; display: none;">⚠️ 可疑脚本:</div>
                            <div id="suspicious-scripts" style="font-size: 12px; color: #fff;"></div>
                        </div>
                        
                        <div id="wi-log" style="background: rgba(0,0,0,0.5); border: 1px solid var(--SmartThemeBorderColor); border-radius: 5px; padding: 10px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; margin-bottom: 10px;">
                            <div style="color: #4CAF50;">[System] Waiting for initialization...</div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button id="wi-clear" class="menu_button">Clear Log</button>
                            <button id="wi-export" class="menu_button">Export Report</button>
                            <button id="wi-test" class="menu_button">Test Char</button>
                            <button id="wi-analyze" class="menu_button">Analyze</button>
                            <button id="wi-find-culprit" class="menu_button" style="background: #f44336;">Find Culprit</button>
                            <button id="wi-scan-scripts" class="menu_button" style="background: #9C27B0;">Scan Scripts</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('#extensions_settings2').append(settingsHtml);
    console.log('[WI Debugger] UI injected');
    
    function showSuspicious() {
        let hasAnySuspicious = suspiciousExtensions.size > 0 || suspiciousScripts.size > 0;
        
        if (!hasAnySuspicious) {
            $('#suspicious-panel').hide();
            return;
        }
        
        // 显示可疑扩展
        if (suspiciousExtensions.size > 0) {
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
        } else {
            $('#suspicious-list').html('');
        }
        
        // 显示可疑脚本
        if (suspiciousScripts.size > 0) {
            $('#suspicious-scripts-header').show();
            let html = '';
            suspiciousScripts.forEach((reasons, script) => {
                html += `<div style="margin: 5px 0; padding: 5px; background: rgba(156,39,176,0.2); border-radius: 3px;">`;
                html += `<div style="color: #CE93D8; font-weight: bold;">📜 ${script}</div>`;
                reasons.forEach(reason => {
                    html += `<div style="margin-left: 15px; color: #ccc;">• ${reason}</div>`;
                });
                html += `</div>`;
            });
            $('#suspicious-scripts').html(html);
        } else {
            $('#suspicious-scripts-header').hide();
            $('#suspicious-scripts').html('');
        }
        
        $('#suspicious-panel').show();
    }
    
    function markSuspicious(extensionName, reason) {
        if (!suspiciousExtensions.has(extensionName)) {
            suspiciousExtensions.set(extensionName, []);
        }
        suspiciousExtensions.get(extensionName).push(reason);
        showSuspicious();
    }
    
    function markSuspiciousScript(scriptName, reason) {
        if (!suspiciousScripts.has(scriptName)) {
            suspiciousScripts.set(scriptName, []);
        }
        suspiciousScripts.get(scriptName).push(reason);
        showSuspicious();
    }
    
 // 扫描 JS-Slash-Runner 脚本
async function scanSlashRunnerScripts() {
    addLog('info', 'Scripts', '🔍 Scanning JS-Slash-Runner scripts...');
    
    let foundScripts = 0;
    
    try {
        // 方法1: 尝试通过 API 获取脚本列表
        const response = await fetch('/api/files/get', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'data/default-user/scripts'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                foundScripts = data.length;
                $('#script-count').text(foundScripts);
                addLog('success', 'Scripts', `Found ${foundScripts} script files via API`);
                
                // 分析脚本名称
                const wiRelated = data.filter(script => {
                    const lower = script.toLowerCase();
                    return lower.includes('world') || 
                           lower.includes('lorebook') ||
                           lower.includes('import') ||
                           lower.includes('character') ||
                           lower.includes('book') ||
                           lower.includes('wi');
                });
                
                if (wiRelated.length > 0) {
                    addLog('warning', 'Scripts', `Found ${wiRelated.length} potentially WI-related scripts:`);
                    wiRelated.forEach(script => {
                        addLog('warning', 'Scripts', `  • ${script}`);
                        markSuspiciousScript(script, 'Script name suggests WI functionality');
                    });
                } else {
                    addLog('info', 'Scripts', 'No obviously WI-related script names found');
                }
            }
        }
    } catch (error) {
        addLog('warning', 'Scripts', `API method failed: ${error.message}`);
    }
    
    // 方法2: 检查已注册的 slash commands
    if (window.SlashCommandParser && window.SlashCommandParser.commands) {
        const commands = Object.keys(window.SlashCommandParser.commands);
        
        // 过滤出可能由脚本注册的命令
        const scriptCommands = commands.filter(cmd => {
            // 排除内置命令
            const builtIn = ['help', 'sendas', 'sys', 'continue', 'impersonate'];
            return !builtIn.includes(cmd);
        });
        
        if (scriptCommands.length > 0) {
            addLog('info', 'Scripts', `Found ${scriptCommands.length} custom slash commands`);
            $('#script-count').text(scriptCommands.length);
            
            // 查找 WI 相关命令
            const wiCommands = scriptCommands.filter(cmd => {
                const lower = cmd.toLowerCase();
                return lower.includes('world') || 
                       lower.includes('lorebook') ||
                       lower.includes('import') ||
                       lower.includes('wi') ||
                       lower.includes('book') ||
                       lower.includes('lore');
            });
            
            if (wiCommands.length > 0) {
                addLog('warning', 'Scripts', `Found ${wiCommands.length} WI-related commands:`);
                wiCommands.forEach(cmd => {
                    addLog('warning', 'Scripts', `  • /${cmd}`);
                    markSuspiciousScript(`Command: /${cmd}`, 'Command name suggests WI functionality');
                    
                    // 尝试获取命令详情
                    try {
                        const cmdObj = window.SlashCommandParser.commands[cmd];
                        if (cmdObj && cmdObj.helpString) {
                            addLog('info', 'Scripts', `    Help: ${cmdObj.helpString}`);
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                });
            }
        }
    }
    
    // 方法3: 检查 JS-Slash-Runner 扩展设置
    const settings = getExtensionSettings();
    const jsSlashSettings = settings['SillyTavern-JsSlashCommands'] || 
                           settings['JsSlashCommands'] ||
                           settings['third-party/SillyTavern-JsSlashCommands'];
    
    if (jsSlashSettings) {
        addLog('success', 'Scripts', 'Found JS-Slash-Runner extension settings');
        
        // 检查设置中是否有脚本列表
        if (jsSlashSettings.scripts && Array.isArray(jsSlashSettings.scripts)) {
            const scriptList = jsSlashSettings.scripts;
            $('#script-count').text(scriptList.length);
            addLog('info', 'Scripts', `Extension settings shows ${scriptList.length} scripts`);
        }
        
        // 检查是否有自动执行的脚本
        if (jsSlashSettings.autoExecute || jsSlashSettings.onStart) {
            addLog('warning', 'Scripts', '⚠️ Extension has auto-execute scripts configured!');
            markSuspiciousScript('JS-Slash-Runner', 'Has auto-execute scripts');
        }
    }
    
    // 方法4: 检查全局作用域中脚本留下的痕迹
    addLog('info', 'Scripts', 'Checking for script traces in global scope...');
    const globalKeys = Object.keys(window);
    
    // 查找可能由脚本创建的全局变量
    const scriptGlobals = globalKeys.filter(key => {
        return (key.startsWith('script_') || 
               key.startsWith('custom_') ||
               key.startsWith('st_')) &&
               (key.toLowerCase().includes('world') ||
                key.toLowerCase().includes('import') ||
                key.toLowerCase().includes('book'));
    });
    
    if (scriptGlobals.length > 0) {
        addLog('warning', 'Scripts', `Found ${scriptGlobals.length} script-related globals:`);
        scriptGlobals.forEach(key => {
            addLog('warning', 'Scripts', `  • ${key}`);
            markSuspiciousScript(`Global: ${key}`, 'Script created global variable');
        });
    }
    
    // 方法5: 检查是否有脚本修改了原型链
    addLog('info', 'Scripts', 'Checking for prototype modifications...');
    const prototypeChecks = [
        { obj: Array, name: 'Array' },
        { obj: String, name: 'String' },
        { obj: Object, name: 'Object' }
    ];
    
    prototypeChecks.forEach(({ obj, name }) => {
        const proto = obj.prototype;
        const keys = Object.getOwnPropertyNames(proto);
        
        // 检查是否有非标准方法
        const customMethods = keys.filter(key => {
            return typeof proto[key] === 'function' && 
                   !['constructor', 'toString', 'valueOf'].includes(key) &&
                   (key.includes('world') || key.includes('import') || key.includes('book'));
        });
        
        if (customMethods.length > 0) {
            addLog('warning', 'Scripts', `${name}.prototype modified: ${customMethods.join(', ')}`);
            markSuspiciousScript('Prototype Modification', `Modified ${name}.prototype`);
        }
    });
    
    // 检查关键函数是否被脚本修改
    checkScriptHooks();
    
    if (foundScripts === 0 && $('#script-count').text() === '-') {
        addLog('warning', 'Scripts', 'Could not determine script count');
        $('#script-count').text('?');
    }
    
    addLog('success', 'Scripts', '✓ Script scan complete');
}

    
    function checkScriptHooks() {
        addLog('info', 'Scripts', 'Checking for script-modified functions...');
        
        const criticalFunctions = [
            'importEmbeddedWorldInfo',
            'importCharacter',
            'processDroppedFiles',
            'loadWorldInfoData'
        ];
        
        criticalFunctions.forEach(funcName => {
            if (window[funcName]) {
                const funcStr = window[funcName].toString();
                
                // 检查是否包含 STscript 相关特征
                const scriptPatterns = [
                    /executeSlashCommands/i,
                    /SlashCommandParser/i,
                    /jsSlashCommands/i,
                    /STscript/i
                ];
                
                scriptPatterns.forEach(pattern => {
                    if (pattern.test(funcStr)) {
                        addLog('warning', 'Scripts', `${funcName} contains STscript code`);
                        markSuspiciousScript('Inline Script', `Modified ${funcName}`);
                    }
                });
            }
        });
    }
    
    $('#wi-clear').on('click', () => {
        logs = [];
        suspiciousExtensions.clear();
        suspiciousScripts.clear();
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
        report += `Extensions: ${Object.keys(settings).length}\n`;
        report += `STscripts: ${$('#script-count').text()}\n\n`;
        
        if (suspiciousExtensions.size > 0) {
            report += '⚠️ SUSPICIOUS EXTENSIONS:\n';
            report += '─────────────────────────────────────\n';
            suspiciousExtensions.forEach((reasons, ext) => {
                report += `\n📌 ${ext}\n`;
                reasons.forEach(reason => {
                    report += `   • ${reason}\n`;
                });
            });
            report += '\n';
        }
        
        if (suspiciousScripts.size > 0) {
            report += '⚠️ SUSPICIOUS SCRIPTS:\n';
            report += '─────────────────────────────────────\n';
            suspiciousScripts.forEach((reasons, script) => {
                report += `\n📜 ${script}\n`;
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
        addLog('success', 'Export', 'Full report exported');
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
                
                if (window.world_info && window.world_info.entries) {
                    const loadedCount = Object.keys(window.world_info.entries).length;
                    addLog('info', 'Test', `ST has ${loadedCount} entries loaded`);
                    
                    if (wi.entries.length > 0 && loadedCount === 0) {
                        addLog('error', 'Test', `⚠️ Card has ${wi.entries.length} but NONE loaded!`);
                        markSuspicious('Import Process', 'WI not loading into ST');
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
    
    $('#wi-scan-scripts').on('click', async () => {
        await scanSlashRunnerScripts();
    });
    
    $('#wi-find-culprit').on('click', async () => {
        addLog('info', 'Culprit', '🔍 Starting comprehensive investigation...');
        
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
                            markSuspicious('Multiple Extensions', `High listener count on ${eventName} (${count})`);
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
                
                if (funcStr.includes('original.apply') || funcStr.includes('original.call')) {
                    addLog('warning', 'Culprit', `⚠️ ${funcName} is hooked`);
                    markSuspicious('Unknown Extension', `Hooked: ${funcName}`);
                }
                
                // 检查是否被脚本修改
                if (/executeSlashCommands|SlashCommandParser|jsSlashCommands/i.test(funcStr)) {
                    addLog('warning', 'Culprit', `⚠️ ${funcName} contains script code`);
                    markSuspiciousScript('Inline Script', `Modified ${funcName}`);
                }
            }
        });
        
        // 3. 扫描脚本
        addLog('info', 'Culprit', 'Scanning STscripts...');
        await scanSlashRunnerScripts();
        
        // 4. 分析扩展
        addLog('info', 'Culprit', 'Analyzing extensions...');
        analyzeExtensions(true);
        
        // 5. 检查全局污染
        addLog('info', 'Culprit', 'Checking globals...');
        const globalProps = Object.keys(window);
        const suspicious = globalProps.filter(prop => {
            return (prop.startsWith('ext_') || 
                   prop.startsWith('plugin_') ||
                   prop.startsWith('stscript_')) &&
                   (prop.toLowerCase().includes('world') || 
                    prop.toLowerCase().includes('import'));
        });
        
        if (suspicious.length > 0) {
            addLog('warning', 'Culprit', `Suspicious globals: ${suspicious.join(', ')}`);
            suspicious.forEach(prop => {
                markSuspicious('Global Pollution', `Global: ${prop}`);
            });
        }
        
        addLog('success', 'Culprit', '✓ Investigation complete');
        
        if (suspiciousExtensions.size === 0 && suspiciousScripts.size === 0) {
            addLog('info', 'Culprit', 'No obvious culprits - check logs for clues');
        }
    });
    
    function analyzeExtensions(deep = false) {
        addLog('info', 'Analysis', 'Analyzing extensions...');
        
        const settings = getExtensionSettings();
        const exts = Object.keys(settings);
        
        if (exts.length === 0) {
            addLog('warning', 'Analysis', 'Cannot access extension_settings');
            return;
        }
        
        $('#ext-count').text(exts.length);
        addLog('info', 'Analysis', `${exts.length} extensions installed`);
        
        const wiRelated = exts.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes('world') || 
                   lower.includes('lorebook') || 
                   lower.includes('import') ||
                   lower.includes('character') ||
                   lower.includes('book');
        });
        
        if (wiRelated.length > 0) {
            addLog('warning', 'Analysis', `WI-related (${wiRelated.length}):`);
            wiRelated.forEach(ext => {
                addLog('warning', 'Analysis', `  • ${ext}`);
                markSuspicious(ext, 'Name suggests WI functionality');
            });
        }
        
        if (deep) {
            exts.forEach(extName => {
                const extSettings = settings[extName];
                if (extSettings && typeof extSettings === 'object') {
                    const keys = Object.keys(extSettings);
                    const suspiciousKeys = keys.filter(key => {
                        const lower = key.toLowerCase();
                        return lower.includes('world') || 
                               lower.includes('import') ||
                               lower.includes('hook');
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
                            
                            // 查找扩展
                            const extPaths = lines.filter(line => line.includes('/extensions/'));
                            if (extPaths.length > 0) {
                                addLog('info', 'Import', 'Extensions in stack:');
                                extPaths.forEach(line => {
                                    const match = line.match(/extensions\/(?:third-party\/)?([^\/\?]+)/);
                                    if (match && match[1] !== extensionName) {
                                        addLog('warning', 'Import', `  • ${match[1]}`);
                                        markSuspicious(match[1], 'In import call stack');
                                    }
                                });
                            }
                            
                            // 查找脚本
                            const scriptPaths = lines.filter(line => 
                                line.includes('JsSlashCommands') || 
                                line.includes('/scripts/') ||
                                line.includes('.st')
                            );
                            if (scriptPaths.length > 0) {
                                addLog('info', 'Import', 'Scripts in stack:');
                                scriptPaths.forEach(line => {
                                    const match = line.match(/([^\/]+\.(?:js|st))/);
                                    if (match) {
                                        addLog('warning', 'Import', `  • ${match[1]}`);
                                        markSuspiciousScript(match[1], 'In import call stack');
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
        
        let hasCulprits = false;
        
        if (suspiciousExtensions.size > 0) {
            addLog('error', 'Diagnosis', '');
            addLog('error', 'Diagnosis', '🎯 Suspicious Extensions:');
            suspiciousExtensions.forEach((reasons, ext) => {
                addLog('error', 'Diagnosis', `  📌 ${ext}`);
            });
            hasCulprits = true;
        }
        
        if (suspiciousScripts.size > 0) {
            addLog('error', 'Diagnosis', '');
            addLog('error', 'Diagnosis', '🎯 Suspicious Scripts:');
            suspiciousScripts.forEach((reasons, script) => {
                addLog('error', 'Diagnosis', `  📜 ${script}`);
            });
            hasCulprits = true;
        }
        
        if (hasCulprits) {
            addLog('info', 'Diagnosis', '');
            addLog('info', 'Diagnosis', '💡 Try disabling these one by one');
        } else {
            addLog('info', 'Diagnosis', '');
            addLog('info', 'Diagnosis', 'Click "Find Culprit" for deeper analysis');
        }
    }
    
    await waitForAPI();
    
    setupHooks();
    
    const settings = getExtensionSettings();
    $('#ext-count').text(Object.keys(settings).length);
    
    // 自动扫描一次脚本
    setTimeout(() => {
        scanSlashRunnerScripts();
    }, 1000);
    
    addLog('success', 'System', '✓ Debugger ready');
    console.log('[WI Debugger] ✓ Loaded');
    // 监控 STscript 执行
function monitorScriptExecution() {
    addLog('info', 'Monitor', 'Starting script execution monitor...');
    
    // Hook executeSlashCommands
    if (window.executeSlashCommands || window.executeSlashCommandsOnChatInput) {
        const originalExecute = window.executeSlashCommands || window.executeSlashCommandsOnChatInput;
        
        window.executeSlashCommandsOnChatInput = window.executeSlashCommands = async function(text, ...args) {
            // 检查命令是否与 WI 相关
            const lower = text.toLowerCase();
            if (lower.includes('world') || 
                lower.includes('lorebook') ||
                lower.includes('import') ||
                lower.includes('book') ||
                lower.includes('/wi')) {
                addLog('warning', 'Monitor', `STscript command executed: ${text.substring(0, 100)}`);
                markSuspiciousScript('Live Execution', `Executed: ${text.substring(0, 50)}`);
            }
            
            return originalExecute.call(this, text, ...args);
        };
        
        addLog('success', 'Monitor', '✓ Monitoring STscript execution');
    }
}

// 在 setupHooks() 后面调用
setTimeout(() => {
    monitorScriptExecution();
}, 2000);

    window.wiDebugger = {
        logs,
        suspicious: suspiciousExtensions,
        scripts: suspiciousScripts,
        scanScripts: () => scanSlashRunnerScripts(),
        findCulprit: () => $('#wi-find-culprit').click()
    };
});
