jQuery(async () => {
    'use strict';
    
    const extensionName = 'jianceqi';
    
    console.log('[WI Debugger] Loading extension...');
    
    let logs = [];
    let importCount = 0;
    let failCount = 0;
    let suspiciousExtensions = new Map(); // 记录可疑扩展及其行为
    let callStack = []; // 记录函数调用栈
    
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
    
    // 创建设置 HTML
    const settingsHtml = `
        <div class="wi-debugger-container">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>🔍 WI Import Debugger</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div style="background: var(--SmartThemeBlurTintColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 10px; padding: 15px;">
                        
                        <!-- 统计面板 -->
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
                        
                        <!-- 可疑扩展列表 -->
                        <div id="suspicious-panel" style="background: rgba(255,0,0,0.1); border: 1px solid #f44336; border-radius: 5px; padding: 10px; margin-bottom: 10px; display: none;">
                            <div style="color: #f44336; font-weight: bold; margin-bottom: 5px;">⚠️ 可疑扩展/脚本:</div>
                            <div id="suspicious-list" style="font-size: 12px; color: #fff;"></div>
                        </div>
                        
                        <!-- 日志面板 -->
                        <div id="wi-log" style="background: rgba(0,0,0,0.5); border: 1px solid var(--SmartThemeBorderColor); border-radius: 5px; padding: 10px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; margin-bottom: 10px;">
                            <div style="color: #4CAF50;">[System] Waiting for initialization...</div>
                        </div>
                        
                        <!-- 按钮组 -->
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button id="wi-clear" class="menu_button">Clear Log</button>
                            <button id="wi-export" class="menu_button">Export Report</button>
                            <button id="wi-test" class="menu_button">Test Current Char</button>
                            <button id="wi-analyze" class="menu_button">Deep Analysis</button>
                            <button id="wi-find-culprit" class="menu_button" style="background: #f44336;">Find Culprit</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('#extensions_settings2').append(settingsHtml);
    console.log('[WI Debugger] UI injected');
    
    // 显示可疑扩展
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
    
    // 标记可疑扩展
    function markSuspicious(extensionName, reason) {
        if (!suspiciousExtensions.has(extensionName)) {
            suspiciousExtensions.set(extensionName, []);
        }
        suspiciousExtensions.get(extensionName).push(reason);
        showSuspicious();
    }
    
    // 绑定按钮
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
        report += `Extensions: ${Object.keys(window.extension_settings || {}).length}\n\n`;
        
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
        addLog('success', 'Export', 'Report exported with suspicious extensions list');
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
                
                // 检查当前加载的 WI
                if (window.world_info && window.world_info.entries) {
                    const loadedCount = Object.keys(window.world_info.entries).length;
                    addLog('info', 'Test', `Currently loaded: ${loadedCount} WI entries`);
                    
                    if (wi.entries.length !== loadedCount) {
                        addLog('error', 'Test', `⚠️ MISMATCH! Card has ${wi.entries.length} but only ${loadedCount} loaded!`);
                    }
                }
            } else {
                addLog('info', 'Test', 'No character_book found in card');
            }
        })
        .catch(err => {
            addLog('error', 'Test', `Failed: ${err.message}`);
        });
    });
    
    $('#wi-analyze').on('click', () => {
        analyzeExtensions();
    });
    
    $('#wi-find-culprit').on('click', async () => {
        addLog('info', 'Culprit', '🔍 Starting deep investigation...');
        
        // 1. 检查哪些扩展监听了相关事件
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
                if (event && window.eventSource.listenerCount(event) > 0) {
                    const count = window.eventSource.listenerCount(event);
                    addLog('warning', 'Culprit', `Event ${eventName} has ${count} listeners`);
                    
                    if (count > 3) {
                        markSuspicious('Unknown Extension', `Unusual number of ${eventName} listeners (${count})`);
                    }
                }
            });
        }
        
        // 2. 检查修改过的全局函数
        addLog('info', 'Culprit', 'Checking for function modifications...');
        
        const criticalFunctions = [
            'importEmbeddedWorldInfo',
            'importCharacter', 
            'processDroppedFiles',
            'loadWorldInfoData'
        ];
        
        criticalFunctions.forEach(funcName => {
            if (window[funcName]) {
                const func = window[funcName];
                const funcStr = func.toString();
                
                // 检查函数是否被包装过
                if (funcStr.includes('original') || funcStr.includes('apply') || funcStr.includes('call')) {
                    addLog('warning', 'Culprit', `${funcName} appears to be wrapped/hooked`);
                    markSuspicious('Unknown Extension', `Hooked function: ${funcName}`);
                }
            }
        });
        
        // 3. 分析所有扩展的代码特征
        analyzeExtensions(true);
        
        addLog('success', 'Culprit', '✓ Investigation complete - check suspicious list above');
    });
    
    function analyzeExtensions(deep = false) {
        addLog('info', 'Analysis', 'Analyzing extensions...');
        
        if (!window.extension_settings) {
            addLog('error', 'Analysis', 'extension_settings not available');
            return;
        }
        
        const exts = Object.keys(window.extension_settings);
        $('#ext-count').text(exts.length);
        
        addLog('info', 'Analysis', `Found ${exts.length} extensions total`);
        
        // 检查 WI 相关扩展
        const wiRelated = exts.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes('world') || 
                   lower.includes('lorebook') || 
                   lower.includes('import') ||
                   lower.includes('character');
        });
        
        if (wiRelated.length > 0) {
            addLog('warning', 'Analysis', `WI-related extensions found:`);
            wiRelated.forEach(ext => {
                addLog('warning', 'Analysis', `  - ${ext}`);
                markSuspicious(ext, 'Extension name suggests WI functionality');
            });
        }
        
        // Deep analysis
        if (deep) {
            addLog('info', 'Analysis', 'Performing deep analysis...');
            
            // 检查每个扩展的设置
            exts.forEach(extName => {
                const settings = window.extension_settings[extName];
                if (settings && typeof settings === 'object') {
                    const keys = Object.keys(settings);
                    
                    // 查找可疑的设置项
                    const suspiciousKeys = keys.filter(key => {
                        const lower = key.toLowerCase();
                        return lower.includes('world') || 
                               lower.includes('lorebook') ||
                               lower.includes('import') ||
                               lower.includes('hook') ||
                               lower.includes('intercept');
                    });
                    
                    if (suspiciousKeys.length > 0) {
                        addLog('warning', 'Analysis', `${extName} has suspicious settings: ${suspiciousKeys.join(', ')}`);
                        markSuspicious(extName, `Has WI-related settings: ${suspiciousKeys.join(', ')}`);
                    }
                }
            });
            
            // 检查 STscript 相关
            if (window.executeSlashCommandsOnChatInput) {
                addLog('info', 'Analysis', 'Checking STscript commands...');
                
                // 尝试获取已注册的命令
                if (window.SlashCommandParser && window.SlashCommandParser.commands) {
                    const commands = Object.keys(window.SlashCommandParser.commands);
                    const wiCommands = commands.filter(cmd => 
                        cmd.includes('world') || 
                        cmd.includes('lorebook') ||
                        cmd.includes('wi')
                    );
                    
                    if (wiCommands.length > 0) {
                        addLog('warning', 'Analysis', `Found ${wiCommands.length} WI-related slash commands: ${wiCommands.join(', ')}`);
                        markSuspicious('STscript', `Registered WI commands: ${wiCommands.join(', ')}`);
                    }
                }
            }
        }
        
        addLog('success', 'Analysis', '✓ Analysis complete');
    }
    
    // Setup hooks
    function setupHooks() {
        addLog('info', 'Hook', 'Setting up function hooks...');
        let hookCount = 0;
        
        // Hook importEmbeddedWorldInfo with call stack tracking
        if (window.importEmbeddedWorldInfo) {
            const original = window.importEmbeddedWorldInfo;
            window.importEmbeddedWorldInfo = async function(...args) {
                const start = performance.now();
                
                // 获取调用栈
                const stack = new Error().stack;
                callStack.push(stack);
                
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
                            
                            // 分析调用栈查找可疑扩展
                            analyzeCallStack(stack);
                            
                            diagnose();
                        } else {
                            addLog('success', 'Import', `✓ Imported ${count} entries (${duration}ms)`);
                        }
                    }
                    
                    return result;
                } catch (error) {
                    addLog('error', 'Import', `✗ Failed: ${error.message}`);
                    addLog('error', 'Import', `Stack: ${error.stack}`);
                    
                    // 分析错误栈
                    analyzeCallStack(error.stack);
                    
                    throw error;
                }
            };
            addLog('success', 'Hook', '✓ Hooked importEmbeddedWorldInfo');
            hookCount++;
        }
        
        $('#hook-count').text(hookCount);
    }
    
    // 分析调用栈找出可疑扩展
    function analyzeCallStack(stack) {
        if (!stack) return;
        
        addLog('info', 'Stack', 'Analyzing call stack...');
        
        const lines = stack.split('\n');
        const extensionPaths = lines.filter(line => 
            line.includes('/extensions/') || 
            line.includes('third-party')
        );
        
        extensionPaths.forEach(line => {
            // 尝试提取扩展名称
            const match = line.match(/extensions\/(?:third-party\/)?([^\/]+)/);
            if (match) {
                const extName = match[1];
                if (extName !== extensionName) { // 排除自己
                    addLog('warning', 'Stack', `Extension in call stack: ${extName}`);
                    markSuspicious(extName, 'Found in import call stack');
                }
            }
        });
    }
    
    function diagnose() {
        addLog('error', 'Diagnosis', '═══════════════════════════');
        addLog('error', 'Diagnosis', '⚠️ IMPORT FAILURE DETECTED');
        addLog('error', 'Diagnosis', '═══════════════════════════');
        
        if (suspiciousExtensions.size > 0) {
            addLog('error', 'Diagnosis', '');
            addLog('error', 'Diagnosis', '🎯 Likely culprits:');
            suspiciousExtensions.forEach((reasons, ext) => {
                addLog('error', 'Diagnosis', `  • ${ext}`);
            });
            addLog('error', 'Diagnosis', '');
            addLog('info', 'Diagnosis', '💡 Recommended action:');
            addLog('info', 'Diagnosis', `Try disabling the extensions listed above one by one`);
        } else {
            addLog('info', 'Diagnosis', 'No obvious culprit found');
            addLog('info', 'Diagnosis', 'Click "Find Culprit" button for deeper analysis');
        }
        
        addLog('info', 'Diagnosis', '');
        addLog('info', 'Diagnosis', '📋 General troubleshooting:');
        addLog('info', 'Diagnosis', '1. Check browser console (F12) for errors');
        addLog('info', 'Diagnosis', '2. Verify character card contains WI data');
        addLog('info', 'Diagnosis', '3. Try importing character again');
    }
    
    // 初始化
    setupHooks();
    
    if (window.extension_settings) {
        const extCount = Object.keys(window.extension_settings).length;
        $('#ext-count').text(extCount);
    }
    
    addLog('success', 'System', '✓ WI Import Debugger initialized');
    console.log('[WI Debugger] ✓ Extension loaded');
    
    // 导出到全局
    window.wiDebugger = {
        logs,
        suspicious: suspiciousExtensions,
        addLog,
        analyze: () => $('#wi-analyze').click(),
        findCulprit: () => $('#wi-find-culprit').click()
    };
});
