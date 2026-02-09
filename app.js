let appData = {};
let currentItem = null;
let qnaStep = 0;
let currentState = {
    hsk: localStorage.getItem('last_hsk') || 'HSK1',
    mode: localStorage.getItem('last_mode') || 'text',
    speed: parseFloat(localStorage.getItem('speech_speed')) || 1.0
};
let weights = {};

// --- UI Elements ---
const els = {
    hsk: document.getElementById('hskLevel'),
    mode: document.getElementById('studyMode'),
    content: document.getElementById('content-area'),
    revealBtn: document.getElementById('revealBtn'),
    nextBtn: document.getElementById('nextBtn'),
    themeBtn: document.getElementById('themeToggle'),
    speedBtn: document.getElementById('speedToggle'),
    speedIcon: document.getElementById('speedIcon')
};

// --- Configuração Inicial ---
// Tema
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    els.themeBtn.innerHTML = '<span class="material-icons-round">dark_mode</span>';
}

els.themeBtn.onclick = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const newTheme = isLight ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    els.themeBtn.innerHTML = `<span class="material-icons-round">${isLight ? 'light_mode' : 'dark_mode'}</span>`;
};

// Velocidade
els.speedIcon.innerText = currentState.speed + 'x';
els.speedBtn.onclick = () => {
    const speeds = [0.7, 1.0, 1.2];
    let idx = speeds.indexOf(currentState.speed);
    currentState.speed = speeds[(idx + 1) % speeds.length]; // Cicla as velocidades
    localStorage.setItem('speech_speed', currentState.speed);
    els.speedIcon.innerText = currentState.speed + 'x';
};

// --- MOTOR TTS (ÁUDIO) ---
window.speak = function(text) {
    if (!window.speechSynthesis) return;

    // Reseta o motor (importante para Chrome/Android)
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const cleanText = text.split('(')[0].trim().normalize('NFC');
    const msg = new SpeechSynthesisUtterance(cleanText);
    
    // Seleção Inteligente de Voz
    const voices = window.speechSynthesis.getVoices();
    
    // Tenta voz local (offline) primeiro
    const voice = voices.find(v => (v.lang.includes('zh-CN') || v.lang.includes('zh')) && v.localService) 
               || voices.find(v => v.lang.includes('zh')); // Fallback

    if (voice) msg.voice = voice;
    
    msg.lang = 'zh-CN';
    msg.rate = currentState.speed;

    // Hack para acordar o sistema se a lista estiver vazia (Mobile)
    if (voices.length === 0) {
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.speak(msg);
    } else {
        window.speechSynthesis.speak(msg);
    }
};

// --- LÓGICA DO APP ---
async function init() {
    try {
        const response = await fetch('assets/data.json');
        appData = await response.json();
        
        els.hsk.value = currentState.hsk;
        els.mode.value = currentState.mode;
        
        loadWeights();
        nextRound();
    } catch (e) {
        els.content.innerHTML = "<p style='text-align:center; color: red'>Erro ao carregar dados.<br>Verifique se rodou o script Python.</p>";
    }
}

// Pesos (Spaced Repetition)
function getWeightsKey() { return `w_${currentState.hsk}_${currentState.mode}`; }

function loadWeights() {
    const key = getWeightsKey();
    const stored = localStorage.getItem(key);
    let allKeys = [];
    const data = appData[currentState.hsk];
    
    if (!data) return;
    if (currentState.mode === 'vocab') allKeys = Object.keys(data.vocab);
    else allKeys = data[currentState.mode].map(i => i.id);

    if (stored) {
        weights = JSON.parse(stored);
        allKeys.forEach(k => { if (weights[k] === undefined) weights[k] = 1.0; });
    } else {
        weights = {};
        allKeys.forEach(k => weights[k] = 1.0);
    }
}

function saveWeights() { localStorage.setItem(getWeightsKey(), JSON.stringify(weights)); }

function draftItem() {
    const keys = Object.keys(weights);
    if (keys.length === 0) return null;
    let sum = 0;
    keys.forEach(k => sum += weights[k]);
    let rnd = Math.random() * sum;
    for (let k of keys) {
        rnd -= weights[k];
        if (rnd < 0) return k;
    }
    return keys[keys.length - 1];
}

function updateWeight(key) {
    const n = Object.keys(weights).length;
    let cfg = { min: 0.1, rec: 0.01 };
    if (n >= 180) cfg = { min: 0.01, rec: 0.05 };
    else if (n >= 90) cfg = { min: 0.02, rec: 0.03 };
    else if (n >= 30) cfg = { min: 0.05, rec: 0.02 };

    for (let k in weights) {
        if (k === key) weights[k] = cfg.min;
        else weights[k] = Math.min(weights[k] + cfg.rec, 1.0);
    }
    saveWeights();
}

// Helpers de Texto
function splitPinyin(text) {
    if (!text) return { han: '', pin: '' };
    text = text.normalize('NFC');
    const regex = /^(.+?)\s*\(([^()]*)\)\s*$/;
    const match = text.match(regex);
    return match ? { han: match[1], pin: match[2] } : { han: text, pin: '' };
}

function renderBlock(text, label, extraClass='') {
    const { han, pin } = splitPinyin(text);
    // Escape para JS
    const cleanHan = han.replace(/'/g, "\\'"); 
    
    return `
    <div class="cn-block ${extraClass}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1">
                ${label ? `<span class="label">${label}</span>` : ''}
                <div class="chinese-text">${han}</div>
                ${pin ? `<div class="pinyin-text">${pin}</div>` : ''}
            </div>
            <button onclick="window.speak('${cleanHan}')" class="audio-btn" title="Ouvir">
                <span class="material-icons-round">volume_up</span>
            </button>
        </div>
    </div>`;
}

// Renderização Principal
function nextRound() {
    const key = draftItem();
    if (!key) { els.content.innerHTML = "Sem dados."; return; }
    
    const data = appData[currentState.hsk];
    qnaStep = 0;
    els.revealBtn.classList.remove('hidden');
    els.nextBtn.classList.add('hidden');
    els.revealBtn.innerText = "Mostrar Tradução";

    let html = `<div class="fade-in">`;

    if (currentState.mode === 'vocab') {
        currentItem = { key, data: data.vocab[key] };
        html += renderBlock(key, 'Termo');
        html += `<div id="part-pt"></div>`;
    } 
    else if (currentState.mode === 'text') {
        const item = data.text.find(x => x.id === key);
        currentItem = { key, data: item };
        html += renderBlock(item.cn, 'Texto');
        html += `<div id="part-pt"></div>`;
    }
    else if (currentState.mode === 'qna') {
        const item = data.qna.find(x => x.id === key);
        currentItem = { key, data: item };
        els.revealBtn.innerText = "Mostrar Resposta";
        html += renderBlock(item.cn.q, 'Pergunta');
        html += `<div id="qna-answer"></div><div id="part-pt"></div>`;
    }
    
    html += `</div>`;
    els.content.innerHTML = html;
}

function reveal() {
    if (currentState.mode !== 'qna') {
        const ptDiv = document.getElementById('part-pt');
        const txt = (currentState.mode === 'vocab') ? currentItem.data : currentItem.data.pt;
        ptDiv.innerHTML = `<div class="solid-divider"></div><div class="fade-in"><span class="label">Tradução</span><div class="pt-text">${txt}</div></div>`;
        finishRound();
    } else {
        if (qnaStep === 0) {
            document.getElementById('qna-answer').innerHTML = `<div class="divider"></div><div class="fade-in">${renderBlock(currentItem.data.cn.a, 'Resposta')}</div>`;
            els.revealBtn.innerText = "Mostrar Tradução";
            qnaStep = 1;
        } else {
            document.getElementById('part-pt').innerHTML = `<div class="solid-divider"></div><div class="fade-in"><span class="label">Tradução Pergunta</span><div class="pt-text">${currentItem.data.pt.q}</div><span class="label">Tradução Resposta</span><div class="pt-text">${currentItem.data.pt.a}</div></div>`;
            finishRound();
        }
    }
}

function finishRound() {
    els.revealBtn.classList.add('hidden');
    els.nextBtn.classList.remove('hidden');
    updateWeight(currentItem.key);
}

// Event Listeners
els.revealBtn.onclick = reveal;
els.nextBtn.oncl
