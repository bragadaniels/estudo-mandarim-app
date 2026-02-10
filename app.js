let appData = {};
let currentItem = null;
let qnaStep = 0;
let currentState = {
    hsk: localStorage.getItem('last_hsk') || 'HSK1',
    mode: localStorage.getItem('last_mode') || 'text'
};
let weights = {};

let speechRate = parseFloat(localStorage.getItem('speechRate')) || 1.0;

const themeToggleBtn = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme') || 'dark';

if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeToggleBtn.innerHTML = '<span class="material-icons-round">dark_mode</span>';
}

themeToggleBtn.onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light') {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeToggleBtn.innerHTML = '<span class="material-icons-round">light_mode</span>';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        themeToggleBtn.innerHTML = '<span class="material-icons-round">dark_mode</span>';
    }
};

let rateToggleBtn;

function createRateToggle() {
    rateToggleBtn = document.createElement('button');
    rateToggleBtn.className = 'icon-btn rate-toggle';
    rateToggleBtn.style.marginLeft = '8px';

    rateToggleBtn.innerHTML = `<span class="material-icons-round volume-icon">play_arrow</span>`;

    const header = document.querySelector('header');
    header.insertBefore(rateToggleBtn, themeToggleBtn);
    rateToggleBtn.onclick = cycleSpeechRate;
}

function showRateToast() {
    const toast = document.createElement('div');
    toast.textContent = `${speechRate}x`;
    toast.className = 'rate-toast';
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 800);
}

function cycleSpeechRate() {
    const rates = [0.5, 1.0, 1.5];
    let idx = rates.findIndex(r => Math.abs(r - speechRate) < 0.01);
    idx = (idx + 1) % rates.length;
    speechRate = rates[idx];
    localStorage.setItem('speechRate', speechRate);
    updateRateDisplay();
    showRateToast();
    updateRateIcon();
}

function updateRateDisplay() {
    const textEl = document.getElementById('rate-text');
    if (textEl) textEl.textContent = `${speechRate}x`;
}

function updateRateIcon() {
    if (!rateToggleBtn) return;

    const icon = rateToggleBtn.querySelector('.material-icons-round');

    if (speechRate === 0.5) icon.textContent = 'slow_motion_video';
    else if (speechRate === 1.0) icon.textContent = 'play_arrow';
    else if (speechRate === 1.5) icon.textContent = 'fast_forward';
    rateToggleBtn.title = `Velocidade: ${speechRate}x`;

}


// --- Elementos ---
const els = {
    hsk: document.getElementById('hskLevel'),
    mode: document.getElementById('studyMode'),
    content: document.getElementById('content-area'),
    revealBtn: document.getElementById('revealBtn'),
    nextBtn: document.getElementById('nextBtn')
};

// --- Inicialização ---
async function init() {
    try {
        const response = await fetch('assets/data.json');
        appData = await response.json();

        els.hsk.value = currentState.hsk;
        els.mode.value = currentState.mode;

        loadWeights();
        nextRound();
        createRateToggle();
        updateRateIcon();
    } catch (e) {
        els.content.innerHTML = "<p style='color:red; text-align:center'>Erro ao carregar dados. <br>Use Ctrl+Shift+R para limpar o cache.</p>";
        console.error(e);
    }
}

// --- Lógica de Pesos ---
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

// --- Helpers de Renderização ---
function splitPinyin(text) {
    if (!text) return { han: '', pin: '' };
    text = text.normalize('NFC');
    const regex = /^(.+?)\s*\(([^()]*)\)\s*$/;
    const match = text.match(regex);
    if (match) return { han: match[1], pin: match[2] };
    return { han: text, pin: '' };
}

function renderBlock(text, label, extraClass = '') {
    const { han, pin } = splitPinyin(text);
    const cleanHan = han.normalize('NFC');

    return `
    <div class="cn-block ${extraClass}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                ${label ? `<span class="label">${label}</span>` : ''}
                <div class="chinese-text">${han}</div>
                ${pin ? `<div class="pinyin-text">${pin}</div>` : ''}
            </div>
            <!-- Botão de Áudio -->
            <button onclick="window.speak(\`${cleanHan}\`)" class="audio-btn" title="Ouvir">
                <span class="material-icons-round">volume_up</span>
            </button>
        </div>
    </div>`;
}

// --- Funções Principais ---
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
        currentItem = { key: key, data: data.vocab[key] };
        html += renderBlock(key, 'Termo');
        html += `<div id="part-pt"></div>`;
    }
    else if (currentState.mode === 'text') {
        const item = data.text.find(x => x.id === key);
        currentItem = { key: key, data: item };
        html += renderBlock(item.cn, 'Texto');
        html += `<div id="part-pt"></div>`;
    }
    else if (currentState.mode === 'qna') {
        els.revealBtn.innerText = "Mostrar Resposta";
        const item = data.qna.find(x => x.id === key);
        currentItem = { key: key, data: item };

        html += renderBlock(item.cn.q, 'Pergunta');
        html += `<div id="qna-answer"></div>`;
        html += `<div id="part-pt"></div>`;
    }

    html += `</div>`;
    els.content.innerHTML = html;
}

function reveal() {
    // 1. TEXTO e VOCAB
    if (currentState.mode !== 'qna') {
        const ptDiv = document.getElementById('part-pt');

        let ptText = (currentState.mode === 'vocab') ? currentItem.data : currentItem.data.pt;

        ptDiv.innerHTML = `
            <div class="solid-divider"></div>
            <div class="fade-in">
                <span class="label">Tradução</span>
                <div class="pt-text">${ptText}</div>
            </div>
        `;
        finishRound();
    }
    // 2. QnA (Passo a passo)
    else {
        if (qnaStep === 0) {
            // Passo 1: Revelar Resposta em Chinês
            const ansDiv = document.getElementById('qna-answer');
            ansDiv.innerHTML = `
                <div class="divider"></div>
                <div class="fade-in">
                    ${renderBlock(currentItem.data.cn.a, 'Resposta')}
                </div>
            `;
            els.revealBtn.innerText = "Mostrar Tradução";
            qnaStep = 1;
        }
        else if (qnaStep === 1) {
            // Passo 2: Revelar Português
            const ptDiv = document.getElementById('part-pt');
            ptDiv.innerHTML = `
                <div class="solid-divider"></div>
                <div class="fade-in">
                    <span class="label">Tradução da Pergunta</span>
                    <div class="pt-text">${currentItem.data.pt.q}</div>
                    
                    <span class="label">Tradução da Resposta</span>
                    <div class="pt-text">${currentItem.data.pt.a}</div>
                </div>
            `;
            finishRound();
        }
    }
}

function finishRound() {
    els.revealBtn.classList.add('hidden');
    els.nextBtn.classList.remove('hidden');
    updateWeight(currentItem.key);
}

window.speak = function (text) {
    const synth = window.speechSynthesis;
    synth.resume();
    synth.cancel();

    const chineseOnly = text.split('(')[0].trim().normalize('NFC');

    const msg = new SpeechSynthesisUtterance(chineseOnly);
    msg.lang = 'zh-CN';
    msg.rate = speechRate;

    let zhVoices = synth.getVoices().filter(v => v.lang.includes('zh') || v.lang.includes('CN'));
    let bestVoice = zhVoices.find(v => v.localService === true) || zhVoices[0];
    if (bestVoice) msg.voice = bestVoice;

    synth.speak(msg);
};



els.revealBtn.onclick = reveal;
els.nextBtn.onclick = nextRound;

els.hsk.onchange = (e) => {
    currentState.hsk = e.target.value;
    localStorage.setItem('last_hsk', currentState.hsk);
    loadWeights();
    nextRound();
};

els.mode.onchange = (e) => {
    currentState.mode = e.target.value;
    localStorage.setItem('last_mode', currentState.mode);
    loadWeights();
    nextRound();
};

init();