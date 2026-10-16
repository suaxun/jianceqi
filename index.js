import { eventSource, event_types } from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";
import { getContext } from "../../../st-context.js";

const extensionName = 'jianceqi';
let logs = [];

function addLog(level, source, msg) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const line = `[${time}] [${source}] ${msg}`;
    logs.push(line);
    console.log(`[WI-DBG] ${line}`);
    const box = document.getElementById('wi-log');
    if (box) {
        const colors = { info:'#2196F3', success:'#4CAF50', warning:'#FF9800', error:'#f44336' };
        const div = document.createElement('div');
        div.style.color = colors[level] || '#fff';
        div.textContent = line;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    }
}

jQuery(async () => {
    $('#extensions_settings2').append(`
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b>🔍 WI Import Debugger</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content">
        <div id="wi-log" style="background:#000;max-height:400px;overflow-y:auto;font-family:monospace;font-size:12px;padding:10px;border-radius:5px;"></div>
        <div style="display:flex;gap:10px;margin-top:10px;">
          <button id="wi-clear" class="menu_button">Clear</button>
          <button id="wi-export" class="menu_button">Export</button>
        </div>
      </div>
    </div>`);

    $('#wi-clear').on('click', () => { logs = []; $('#wi-log').empty(); });
    $('#wi-export').on('click', () => {
        const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `wi-dbg-${Date.now()}.txt`;
        a.click();
    });

    // 1. 抓所有网络请求：fetch + XHR + jQuery
    const origFetch = window.fetch;
    window.fetch = async function(url, opt) {
        if (typeof url === 'string' && /characters|worldinfo|lorebook|world-info|import/i.test(url)) {
            addLog('info', 'FETCH', `${opt?.method||'GET'} ${url}`);
            try {
                const r = await origFetch(url, opt);
                addLog(r.ok?'success':'error', 'FETCH', `→ ${r.status} ${url}`);
                // 关键：看卡里到底有多少条
                if (url.includes('/api/characters/get') && r.ok) {
                    const clone = r.clone();
                    clone.json().then(d => {
                        const book = d?.data?.character_book || d?.character_book;
                        const n = Array.isArray(book?.entries) ? book.entries.length : -1;
                        addLog(n===0?'error':'success', 'CARD', `character_book.entries = ${n}`);
                        if (book && n > 0) {
                            addLog('info', 'CARD', `第一条keys: ${JSON.stringify(book.entries[0]?.keys)?.slice(0,200)}`);
                        }
                    }).catch(()=>{});
                }
                // 关键：看世界书写入返回
                if (/worldinfo/i.test(url) && r.ok) {
                    const clone = r.clone();
                    clone.text().then(t => addLog('info', 'WI-API', `${url} 返回前300字: ${t.slice(0,300)}`)).catch(()=>{});
                }
                return r;
            } catch(e) { addLog('error','FETCH',`FAIL ${url} ${e.message}`); throw e; }
        }
        return origFetch(url, opt);
    };

    // XHR 兜底
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u, ...rest) {
        this._dbgUrl = u; this._dbgMethod = m;
        if (typeof u === 'string' && /characters|worldinfo|lorebook/i.test(u)) {
            addLog('info', 'XHR', `${m} ${u}`);
            this.addEventListener('load', function() {
                addLog('info', 'XHR', `→ ${this.status} ${u}`);
            });
        }
        return origOpen.call(this, m, u, ...rest);
    };

    // 2. 抓弹窗出现
    const obs = new MutationObserver((muts) => {
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (!(n instanceof HTMLElement)) continue;
                if (n.matches?.('dialog.popup, .popup') || n.querySelector?.('dialog.popup, .popup')) {
                    const txt = (n.innerText||'').slice(0,500);
                    if (/世界书|lorebook|world|character_book|条目/i.test(txt)) {
                        addLog('warning', 'POPUP', `弹窗出现: ${txt.slice(0,300)}`);
                        addLog('info', 'POPUP', `堆栈: ${new Error().stack.split('\n').filter(l=>l.includes('/extensions/')).join(' | ').slice(0,500)}`);
                    }
                }
            }
        }
    });
    obs.observe(document.body, { childList:true, subtree:true });

    // 3. 抓你点的那个“是”按钮，用捕获阶段，一定能抓到
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest?.('.popup-button-ok, [data-result="1"]');
        if (!btn) return;
        const popupText = btn.closest('dialog, .popup')?.innerText?.slice(0,500) || '';
        addLog('error', 'CLICK-YES', `════ 你点了“是” ════`);
        addLog('info', 'CLICK-YES', `弹窗内容: ${popupText.slice(0,300)}`);
        addLog('info', 'CLICK-YES', `调用栈扩展: ${new Error().stack.split('\n').filter(l=>l.includes('/extensions/')).join(' | ').slice(0,800)}`);

        // 点完后 1s / 3s 各查一次到底建了几个世界书
        for (const delay of [1000, 3000]) {
            setTimeout(async () => {
                try {
                    const ctx = getContext();
                    const chid = ctx.characterId;
                    const char = ctx.characters?.[chid];
                    addLog('info', `CHECK+${delay}ms`, `当前角色: ${char?.name}, avatar=${char?.avatar}`);
                    if (char) {
                        const r = await origFetch('/api/characters/get', {
                            method:'POST', headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({ avatar_url: char.avatar })
                        });
                        const d = await r.json();
                        const book = d?.data?.character_book;
                        addLog('info', `CHECK+${delay}ms`, `重读卡 character_book=${book?.entries?.length ?? '无'}`);
                    }
                    // 列出当前世界书文件
                    const r2 = await origFetch('/api/worldinfo/list', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
                    if (r2.ok) {
                        const d2 = await r2.text();
                        addLog('info', `CHECK+${delay}ms`, `worldinfo/list: ${d2.slice(0,500)}`);
                    }
                } catch(err) { addLog('error','CHECK', err.message); }
            }, delay);
        }
    }, true);

    // 4. 抓所有 ST 事件，看谁在导入时插手
    const evtNames = Object.values(event_types || {});
    for (const ev of evtNames) {
        eventSource.on(ev, (...a) => {
            if (/CHAR|WORLD|IMPORT|LORE/i.test(ev)) {
                addLog('info','EVENT', `${ev} 触发`);
            }
        });
    }

    addLog('success','SYS','✓ 已安装：去复现一次导入，点“是”后等5秒再点Export');
});
