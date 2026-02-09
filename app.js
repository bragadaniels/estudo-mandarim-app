let appData = {};
let currentItem = null;
let currentState = {
    hsk: localStorage.getItem('last_hsk') || 'HSK1',
    mode: localStorage.getItem('last_mode') || 'text'
};
// Store weights in localStorage: key = "weights_HSK1_text"
let weights = {};

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
    } catch (e) {
        els.content.innerHTML = "Erro ao carregar dados. Verifique o data.json";
        console.error(e);
    }
}

// --- Lógica de Pesos (Igual ao Python) ---
function getWeightsKey() {
    return `w_${currentState.hsk}_${currentState.mode}`;
}

function loadWeights() {
    const key = getWeightsKey();
    const stored = localStorage.getItem(key);

    // Obter todas as chaves possíveis para o modo atual
    let allKeys = [];
    const data = appData[currentState.hsk];
    if (!data) return;

    if (currentState.mode === 'vocab') {
        allKeys = Object.keys(data.vocab);
    } else {
        // text ou qna são arrays, usamos o ID ou índice
        allKeys = data[currentState.mode].map(i => i.id);
    }

    if (stored) {
        weights = JSON.parse(stored);
        // Verificar se há novas chaves não salvas
        allKeys.forEach(k => { if (weights[k] === undefined) weights[k] = 1.0; });
    } else {
        // Inicializar tudo com 1.0
        weights = {};
        allKeys.forEach(k => weights[k] = 1.0);
    }
}

function saveWeights() {
    localStorage.setItem(getWeightsKey(), JSON.stringify(weights));
}

function draftItem() {
    const keys = Object.keys(weights);
    if (keys.length === 0) return null;

    // Algoritmo de escolha ponderada
    let sum = 0;
    keys.forEach(k => sum += weights[k]);

    let rnd = Math.random() * sum;
    let selectedKey = keys[keys.length - 1];

    for (let k of keys) {
        rnd -= weights[k];
        if (rnd < 0) {
            selectedKey = k;
            break;
        }
    }
    return selectedKey;
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

// --- Helpers de Texto ---
function splitPinyin(text) {
    const regex = /^(.+?)\s*\(([^()]*)\)\s*$/;
    const match = text.match(regex);
    if (match) return { han: match[1], pin: match[2] };
    return { han: text, pin: '' };
}

function renderChinese(text, label = '') {
    const { han, pin } = splitPinyin(text);
    let html = `<span class="label">${label}</span><div class="chinese-text">${han}</div>`;
    if (pin) html += `<div class="pinyin-text">${pin}</div>`;
    return html;
}

// --- Renderização ---
function nextRound() {
    const key = draftItem();
    if (!key) {
        els.content.innerHTML = "Sem dados para este nível/modo.";
        return;
    }

    const data = appData[currentState.hsk];

    if (currentState.mode === 'vocab') {
        currentItem = { key: key, data: data.vocab[key], type: 'vocab' };
        els.content.innerHTML = renderChinese(key, 'Termo');
    }
    else if (currentState.mode === 'text') {
        const item = data.text.find(x => x.id === key);
        currentItem = { key: key, data: item, type: 'text' };
        els.content.innerHTML = renderChinese(item.cn, 'Texto');
    }
    else if (currentState.mode === 'qna') {
        const item = data.qna.find(x => x.id === key);
        currentItem = { key: key, data: item, type: 'qna' };
        els.content.innerHTML = `
            ${renderChinese(item.cn.q, 'Pergunta')}
            <hr style="border: 0; border-top: 1px solid #333; margin: 10px 0;">
            <div id="qna-answer" class="hidden">
                ${renderChinese(item.cn.a, 'Resposta')}
            </div>
        `;
    }

    els.revealBtn.classList.remove('hidden');
    els.nextBtn.classList.add('hidden');
    // Para QnA, o reveal tem 2 estagios, mas vamos simplificar: mostra Resposta CH + Traducoes
}

function reveal() {
    let html = els.content.innerHTML;

    if (currentState.mode === 'vocab') {
        html += `<div class="pt-text"><span class="label">Significado</span>${currentItem.data}</div>`;
    }
    else if (currentState.mode === 'text') {
        html += `<div class="pt-text"><span class="label">Tradução</span>${currentItem.data.pt}</div>`;
    }
    else if (currentState.mode === 'qna') {
        // Revelar a resposta em chinês se estava oculta
        const ansDiv = document.getElementById('qna-answer');
        if (ansDiv) ansDiv.classList.remove('hidden');

        html = els.content.innerHTML; // Pega o estado atual com a resposta visivel
        html += `<div class="pt-text">
            <span class="label">Tradução Pergunta</span>${currentItem.data.pt.q}<br><br>
            <span class="label">Tradução Resposta</span>${currentItem.data.pt.a}
        </div>`;
    }

    els.content.innerHTML = html;
    els.revealBtn.classList.add('hidden');
    els.nextBtn.classList.remove('hidden');

    // Atualizar pesos
    updateWeight(currentItem.key);
}

// --- Event Listeners ---
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

// Iniciar
init();

// No final do app.js
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log('Service Worker Registered'));
}