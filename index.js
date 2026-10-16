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
    
// 获取扩展设置的兼容方法
function getExtensionSettings() {
    // 尝试多种可能的路径
    return window.extension_settings || 
           window.extensionSettings || 
           window.SillyTavern?.extensionSettings ||
           window.extensions?.settings ||
           // 尝试从 localStorage 读取
           (function() {
               try {
                   const stored = localStorage.getItem('extension_settings');
                   return stored ? JSON.parse(stored) : {};
               } catch (e) {
                   return {};
               }
           })();
}

// 获取 context 的兼容方法
function getContextCompat() {
    if (window.getContext) {
        return window.getContext();
    }
    
    // 尝试直接访问全局变量
    if (window.characters && window.this_chid !== undefined) {
        return {
            characters: window.characters,
            characterId: window.this_chid,
            chat: window.chat
        };
    }
    
    // 尝试从 SillyTavern 对象获取
    if (window.SillyTavern) {
        return window.SillyTavern;
    }
    
    return null;
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
<button id="wi-refresh-scripts" class="menu_button" style="background: #9C27B0;">Refresh List</button>
<button id="wi-list-everything" class="menu_button" style="background: #607D8B;">List Everything</button>
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
    let wiRelatedScripts = [];
    
    // 方法1: 从 DOM 中读取脚本列表（最可靠的方法）
    addLog('info', 'Scripts', 'Reading scripts from DOM...');
    const scriptElements = document.querySelectorAll('[data-type="script"][data-script-id]');
    
    if (scriptElements.length > 0) {
        foundScripts = scriptElements.length;
        $('#script-count').text(foundScripts);
        addLog('success', 'Scripts', `✓ Found ${foundScripts} scripts in DOM`);
        
        // 分析每个脚本
        scriptElements.forEach((element) => {
            // 获取脚本名称（在 div 中的文本）
            const nameElement = element.querySelector('.w-0.grow');
            const scriptName = nameElement ? nameElement.textContent.trim() : 'Unknown';
            const scriptId = element.getAttribute('data-script-id');
            
            // 检查是否启用
            const toggleIcon = element.querySelector('i.fa-toggle-off, i.fa-toggle-on');
            const isEnabled = toggleIcon && toggleIcon.classList.contains('fa-toggle-on');
            
            addLog('info', 'Scripts', `  • ${scriptName} ${isEnabled ? '✓' : '✗'}`);
            
            // 检查脚本名称是否包含 WI 相关关键词
            const lower = scriptName.toLowerCase();
            const keywords = ['world', 'lorebook', 'import', 'character', 'book', 'wi', '世界', '书', '导入', '角色'];
            const hasKeyword = keywords.some(kw => lower.includes(kw));
            
            if (hasKeyword) {
                wiRelatedScripts.push({ name: scriptName, id: scriptId, enabled: isEnabled });
                
                if (isEnabled) {
                    addLog('warning', 'Scripts', `    ⚠️ This script is ENABLED and name suggests WI functionality`);
                    markSuspiciousScript(scriptName, 'Enabled script with WI-related name');
                } else {
                    addLog('info', 'Scripts', `    (Disabled, but name suggests WI functionality)`);
                }
            }
        });
        
        if (wiRelatedScripts.length > 0) {
            addLog('warning', 'Scripts', `Found ${wiRelatedScripts.length} potentially WI-related scripts:`);
            wiRelatedScripts.forEach(script => {
                addLog('warning', 'Scripts', `  📜 ${script.name} (${script.enabled ? 'ENABLED' : 'disabled'})`);
            });
        } else {
            addLog('success', 'Scripts', '✓ No obviously WI-related script names found');
        }
    } else {
        addLog('warning', 'Scripts', 'No script elements found in DOM');
        addLog('info', 'Scripts', 'JS-Slash-Runner may not be installed or not loaded yet');
    }
    
    // 方法2: 检查已注册的 slash commands
    if (window.SlashCommandParser && window.SlashCommandParser.commands) {
        addLog('info', 'Scripts', 'Checking registered slash commands...');
        const commands = Object.keys(window.SlashCommandParser.commands);
        
        // 过滤出自定义命令
        const customCommands = commands.filter(cmd => {
            // 排除 SillyTavern 内置命令
            const builtIn = [
                'help', 'sendas', 'sys', 'continue', 'impersonate', 'delchat',
                'bg', 'char', 'group', 'persona', 'note', 'world', 'roll'
            ];
            return !builtIn.includes(cmd);
        });
        
        if (customCommands.length > 0) {
            addLog('info', 'Scripts', `Found ${customCommands.length} custom slash commands`);
            
            // 查找 WI 相关命令
            const wiCommands = customCommands.filter(cmd => {
                const lower = cmd.toLowerCase();
                return lower.includes('world') || 
                       lower.includes('lorebook') ||
                       lower.includes('import') ||
                       lower.includes('wi') ||
                       lower.includes('book') ||
                       lower.includes('lore') ||
                       lower.includes('entry');
            });
            
            if (wiCommands.length > 0) {
                addLog('warning', 'Scripts', `Found ${wiCommands.length} WI-related commands:`);
                wiCommands.forEach(cmd => {
                    addLog('warning', 'Scripts', `  • /${cmd}`);
                    markSuspiciousScript(`Command: /${cmd}`, 'Custom command related to WI');
                });
            }
        }
    }
    
    // 方法3: 检查扩展设置
    const settings = getExtensionSettings();
    const jsSlashKeys = [
        'SillyTavern-JsSlashCommands',
        'JsSlashCommands', 
        'third-party/SillyTavern-JsSlashCommands',
        'js-slash-commands'
    ];
    
    let jsSlashSettings = null;
    for (const key of jsSlashKeys) {
        if (settings[key]) {
            jsSlashSettings = settings[key];
            addLog('success', 'Scripts', `Found JS-Slash-Runner settings under key: ${key}`);
            break;
        }
    }
    
    if (jsSlashSettings) {
        // 检查自动执行设置
        const autoExecKeys = ['autoExecute', 'onStart', 'onLoad', 'autorun'];
        const hasAutoExec = autoExecKeys.some(key => jsSlashSettings[key]);
        
        if (hasAutoExec) {
            addLog('warning', 'Scripts', '⚠️ JS-Slash-Runner has auto-execute configured!');
            markSuspiciousScript('JS-Slash-Runner', 'Has auto-execute scripts');
        }
        
        // 检查是否有存储的脚本信息
        if (jsSlashSettings.scripts) {
            addLog('info', 'Scripts', `Settings contain script data`);
        }
    }
    
    // 方法4: 检查全局作用域
    addLog('info', 'Scripts', 'Checking global scope...');
    const globalKeys = Object.keys(window);
    
    const scriptGlobals = globalKeys.filter(key => {
        return (key.startsWith('script_') || 
               key.startsWith('custom_') ||
               key.startsWith('st_') ||
               key.startsWith('jssr_')) &&
               (key.toLowerCase().includes('world') ||
                key.toLowerCase().includes('import') ||
                key.toLowerCase().includes('book'));
    });
    
    if (scriptGlobals.length > 0) {
        addLog('warning', 'Scripts', `Found ${scriptGlobals.length} WI-related globals:`);
        scriptGlobals.forEach(key => {
            addLog('warning', 'Scripts', `  • window.${key}`);
            markSuspiciousScript(`Global: ${key}`, 'Script created WI-related global');
        });
    }
    
    // 检查关键函数是否被修改
    checkScriptHooks();
    
    if (foundScripts === 0) {
        $('#script-count').text('0');
        addLog('warning', 'Scripts', 'No scripts found - JS-Slash-Runner may not be active');
    }
    
    addLog('success', 'Scripts', '✓ Script scan complete');
    
    return { total: foundScripts, wiRelated: wiRelatedScripts };
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
    
    const context = getContextCompat();
    
    if (!context) {
        addLog('error', 'Test', 'Cannot access context - trying fallback methods');
        
        // 尝试直接从全局变量获取
        if (window.characters && window.this_chid !== undefined) {
            const chid = window.this_chid;
            const char = window.characters[chid];
            
            if (char) {
                addLog('success', 'Test', `Found character via globals: ${char.name}`);
                testCharacterWI(char);
                return;
            }
        }
        
        addLog('error', 'Test', 'No character data available');
        return;
    }
    
    if (context.characterId === undefined) {
        addLog('warning', 'Test', 'No character selected');
        return;
    }
    
    const char = context.characters[context.characterId];
    addLog('info', 'Test', `Character: ${char.name}`);
    
    testCharacterWI(char);
});

// 提取测试逻辑到单独函数
function testCharacterWI(char) {
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
                addLog('info', 'Test', `ST loaded: ${loadedCount} entries`);
                
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
}

    
    $('#wi-analyze').on('click', () => {
        analyzeExtensions(false);
    });
    
    $('#wi-scan-scripts').on('click', async () => {
        await scanSlashRunnerScripts();
    });
    $('#wi-refresh-scripts').on('click', async () => {
    addLog('info', 'Scripts', 'Refreshing script list...');
    suspiciousScripts.clear();
    
    // 等待 DOM 更新
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await scanSlashRunnerScripts();
});
$('#wi-list-everything').on('click', async () => {
    addLog('info', 'List', '📋 Listing everything...');
    addLog('info', 'List', '');
    
    // 1. 列出所有扩展（从 DOM）
    addLog('info', 'List', '═══ EXTENSIONS (from DOM) ═══');
    const extScripts = document.querySelectorAll('script[src*="/extensions/"]');
    const extensionNames = new Set();
    
    extScripts.forEach(script => {
        const src = script.getAttribute('src');
        const match = src.match(/extensions\/(?:third-party\/)?([^\/]+)/);
        if (match && match[1]) {
            extensionNames.add(match[1]);
        }
    });
    
    if (extensionNames.size > 0) {
        addLog('success', 'List', `Found ${extensionNames.size} extensions:`);
        Array.from(extensionNames).sort().forEach((name, idx) => {
            addLog('info', 'List', `${idx + 1}. ${name}`);
        });
    } else {
        addLog('warning', 'List', 'No extensions found in DOM');
    }
    
    // 2. 列出所有脚本（从 DOM）
    addLog('info', 'List', '');
    addLog('info', 'List', '═══ SCRIPTS (from DOM) ═══');
    const scriptElements = document.querySelectorAll('[data-type="script"][data-script-id]');
    
    if (scriptElements.length > 0) {
        addLog('success', 'List', `Found ${scriptElements.length} scripts:`);
        scriptElements.forEach((element, idx) => {
            const nameElement = element.querySelector('.w-0.grow');
            const scriptName = nameElement ? nameElement.textContent.trim() : 'Unknown';
            const toggleIcon = element.querySelector('i.fa-toggle-off, i.fa-toggle-on');
            const isEnabled = toggleIcon && toggleIcon.classList.contains('fa-toggle-on');
            
            addLog('info', 'List', `${idx + 1}. ${scriptName} ${isEnabled ? '✓' : '✗'}`);
        });
    } else {
        addLog('warning', 'List', 'No scripts found in DOM');
    }
    
    // 3. 列出关键全局变量
    addLog('info', 'List', '');
    addLog('info', 'List', '═══ KEY GLOBALS ═══');
    const keyGlobals = [
        'getContext',
        'extension_settings',
        'importEmbeddedWorldInfo',
        'importCharacter',
        'world_info',
        'characters',
        'this_chid',
        'SlashCommandParser'
    ];
    
    keyGlobals.forEach(key => {
        const exists = window[key] !== undefined;
        const type = exists ? typeof window[key] : 'undefined';
        addLog(exists ? 'success' : 'warning', 'List', `window.${key}: ${type}`);
    });
    
    addLog('info', 'List', '');
    addLog('success', 'List', '✓ Complete');
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
    
    // 先尝试直接读取 DOM 中已加载的扩展脚本
    addLog('info', 'Analysis', 'Scanning loaded extension scripts...');
    const extScripts = document.querySelectorAll('script[src*="/extensions/"]');
    
    if (extScripts.length > 0) {
        addLog('success', 'Analysis', `Found ${extScripts.length} extension scripts in DOM`);
        
        const extensionNames = [];
        extScripts.forEach(script => {
            const src = script.getAttribute('src');
            // 提取扩展名称：/extensions/third-party/名称/index.js
            const match = src.match(/extensions\/(?:third-party\/)?([^\/]+)/);
            if (match && match[1]) {
                const extName = match[1];
                if (!extensionNames.includes(extName)) {
                    extensionNames.push(extName);
                }
            }
        });
        
        $('#ext-count').text(extensionNames.length);
        addLog('info', 'Analysis', `Detected ${extensionNames.length} unique extensions:`);
        
        // 分析扩展名称
        const wiRelated = extensionNames.filter(name => {
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
                markSuspicious(ext, 'Extension name suggests WI functionality');
            });
        }
        
        // 列出所有扩展
        if (deep) {
            extensionNames.forEach((name, idx) => {
                addLog('info', 'Analysis', `${idx + 1}. ${name}`);
            });
        }
    } else {
        addLog('warning', 'Analysis', 'No extension scripts found in DOM');
    }
    
    // 尝试从 settings 读取
    const settings = getExtensionSettings();
    const settingsKeys = Object.keys(settings);
    
    if (settingsKeys.length > 0) {
        addLog('success', 'Analysis', `Found ${settingsKeys.length} extensions in settings`);
        $('#ext-count').text(settingsKeys.length);
        
        const wiRelated = settingsKeys.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes('world') || 
                   lower.includes('lorebook') || 
                   lower.includes('import') ||
                   lower.includes('character') ||
                   lower.includes('book');
        });
        
        if (wiRelated.length > 0) {
            addLog('warning', 'Analysis', `WI-related in settings (${wiRelated.length}):`);
            wiRelated.forEach(ext => {
                addLog('warning', 'Analysis', `  • ${ext}`);
                markSuspicious(ext, 'Settings suggest WI functionality');
            });
        }
        
        // Deep analysis
        if (deep) {
            addLog('info', 'Analysis', 'Deep analysis of extension settings...');
            
            settingsKeys.forEach(extName => {
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
                        markSuspicious(extName, `Suspicious settings: ${suspiciousKeys.join(', ')}`);
                    }
                }
            });
        }
    } else {
        addLog('warning', 'Analysis', 'Cannot access extension_settings');
    }
    
    addLog('success', 'Analysis', '✓ Complete');
}

    
function setupHooks() {
    addLog('info', 'Hook', 'Installing fetch interceptor...');

    const origFetch = window.fetch;
    let importSession = null;

    window.fetch = async function(url, options) {
        let bodyText = '';
        try { bodyText = options?.body ? String(options.body).slice(0,2000) : ''; } catch(e){}

        // 1. 抓角色卡导入
        if (typeof url === 'string' && url.includes('/api/characters/import')) {
            importSession = { id: Date.now(), start: performance.now() };
            addLog('error', 'IMPORT-START', `════ 开始导入 session=${importSession.id} ════`);
            addLog('info', 'IMPORT', `URL: ${url}`);
        }

        const resp = await origFetch(url, options);

        try {
            // 2. 角色导入返回了什么文件名
            if (typeof url === 'string' && url.includes('/api/characters/import') && resp.ok) {
                const clone = resp.clone();
                const data = await clone.json().catch(()=>null);
                addLog('success', 'IMPORT', `import返回: ${JSON.stringify(data).slice(0,500)}`);
                if (importSession) importSession.file = data?.file_name;
            }

            // 3. 读卡，看卡里到底有多少 character_book.entries
            if (typeof url === 'string' && url.includes('/api/characters/get') && resp.ok) {
                const clone = resp.clone();
                const data = await clone.json().catch(()=>null);
                const book = data?.data?.character_book || data?.character_book;
                const n = Array.isArray(book?.entries) ? book.entries.length : -1;
                addLog(n===0?'error':'success', 'CARD', `卡内 character_book.entries = ${n}`);
                if (n===0 && importSession) {
                    addLog('error', 'CARD', `卡本身就是0条，那第二次导入也不该正常 → 说明问题在“建世界书”那一步`);
                }
            }

            // 4. 抓世界书相关写入
            if (typeof url === 'string' && /worldinfo|lorebook|world-info/i.test(url)) {
                addLog('warning', 'WI-API', `${options?.method||'GET'} ${url} → ${resp.status}`);
                if ((options?.method||'').toUpperCase() !== 'GET' && resp.ok) {
                    const clone = resp.clone();
                    const txt = await clone.text().catch(()=> '');
                    addLog('info', 'WI-API', `返回前300字: ${txt.slice(0,300)}`);
                }
            }
        } catch(e){}

        return resp;
    };

    // 5. 抓 popup，就是你说的 popup-content
    if (window.Popup) {
        const origShow = window.Popup.show.text;
        // 不同版本 API 不一样，这里做兼容，只记录调用
        addLog('info', 'Hook', 'Popup hook 需要按你的版本调，先靠 fetch + console 也够');
    }

    addLog('success', 'Hook', '✓ fetch 拦截已安装，现在去复现一次导入');
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
