let appData = {};
let currentItem = null;
let qnaStep = 0;
let quizAttempts = 0;

let currentState = {
    hsk: localStorage.getItem('last_hsk') || 'HSK1',
    mode: localStorage.getItem('last_mode') || 'text'
};
let weights = {};

let speechRate = parseFloat(localStorage.getItem('speechRate')) || 1.0;

// --- Configuração de Tema ---
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

// --- Configuração de Velocidade ---
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
    showRateToast();
    updateRateIcon();
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
        els.content.innerHTML = `<p style='color:red; text-align:center'>Erro ao carregar dados.<br>${e.message}</p>`;
        console.error(e);
    }
}

// --- Pesos ---
function getWeightsKey() { return `w_${currentState.hsk}_${currentState.mode}`; }

function loadWeights() {
    const key = getWeightsKey();
    const stored = localStorage.getItem(key);
    let allKeys = [];
    const data = appData[currentState.hsk];

    if (!data) return;

    if (currentState.mode === 'vocab' || currentState.mode === 'quiz') {
        allKeys = Object.keys(data.vocab);
    } else {
        if (data[currentState.mode]) {
            allKeys = data[currentState.mode].map(i => i.id);
        }
    }

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

function updateWeight(key, success = true) {
    if (!success) {
        weights[key] = 2.0;
        saveWeights();
        return;
    }

    const n = Object.keys(weights).length;
    let cfg = { min: 0.1, rec: 0.01 };
    if (n >= 180) cfg = { min: 0.01, rec: 0.05 };
    else if (n >= 90) cfg = { min: 0.02, rec: 0.03 };
    else if (n >= 30) cfg = { min: 0.05, rec: 0.02 };

    for (let k in weights) {
        if (k === key) weights[k] = cfg.min;
        else {
            let increment = cfg.rec;
            if (weights[k] > 1.0) increment = cfg.rec * 2;
            weights[k] = Math.min(weights[k] + increment, 1.0);
        }
    }
    saveWeights();
}

// --- Renderização ---
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
            <button onclick="window.speak(\`${cleanHan}\`)" class="audio-btn" title="Ouvir">
                <span class="material-icons-round">volume_up</span>
            </button>
        </div>
    </div>`;
}

// --- Core ---
// --- Core ---
function nextRound() {
    // 1. Limpa a tela imediatamente
    els.content.innerHTML = '';

    try {
        const key = draftItem();
        if (!key) {
            els.content.innerHTML = "<p style='text-align:center; margin-top:20px'>Sem dados disponíveis.</p>";
            return;
        }

        const data = appData[currentState.hsk];
        qnaStep = 0;
        quizAttempts = 0;

        els.revealBtn.classList.remove('hidden');
        els.nextBtn.classList.add('hidden');
        els.revealBtn.innerText = "Mostrar Tradução";

        let html = `<div class="fade-in">`;

        // MODO: Vocabulário
        if (currentState.mode === 'vocab') {
            // Validação de segurança
            if (!data.vocab[key]) {
                console.warn(`Dados ausentes para: ${key}. Removendo do cache.`);
                delete weights[key]; saveWeights(); nextRound(); return;
            }

            currentItem = { key: key, data: data.vocab[key] };
            html += renderBlock(key, 'Termo');
            html += `<div id="part-pt"></div>`;
        }
        // MODO: Texto
        else if (currentState.mode === 'text') {
            const item = data.text.find(x => x.id === key);
            if (!item) {
                delete weights[key]; saveWeights(); nextRound(); return;
            }
            currentItem = { key: key, data: item };
            html += renderBlock(item.cn, 'Texto');
            html += `<div id="part-pt"></div>`;
        }
        // MODO: Diálogo (QnA)
        else if (currentState.mode === 'qna') {
            els.revealBtn.innerText = "Mostrar Resposta";
            const item = data.qna.find(x => x.id === key);
            if (!item) {
                delete weights[key]; saveWeights(); nextRound(); return;
            }
            currentItem = { key: key, data: item };

            html += renderBlock(item.cn.q, 'Pergunta');
            html += `<div id="qna-answer"></div>`;
            html += `<div id="part-pt"></div>`;
        }
        // MODO: Quiz
        else if (currentState.mode === 'quiz') {
            els.revealBtn.classList.add('hidden'); // Esconde botão revelar

            const correctDef = data.vocab[key];

            // --- CORREÇÃO DO BUG: Validação de Dados ---
            // Se a tradução não existe ou não é texto, limpa e pula
            if (!correctDef || typeof correctDef !== 'string') {
                console.warn(`Tradução inválida para chave: ${key}. Pulando.`);
                delete weights[key]; // Remove chave corrompida dos pesos
                saveWeights();
                nextRound(); // Tenta o próximo
                return;
            }
            // -------------------------------------------

            currentItem = { key: key, data: correctDef };

            html += renderBlock(key, 'Quiz');

            // Gerar Opções
            // Filtra apenas definições que são textos válidos (evita undefined nos distratores)
            const allDefinitions = Object.values(data.vocab).filter(v => v && typeof v === 'string');

            const distractors = allDefinitions
                .filter(d => d !== correctDef)
                .sort(() => 0.5 - Math.random())
                .slice(0, 2);

            const options = [correctDef, ...distractors].sort(() => 0.5 - Math.random());

            html += `<div class="quiz-container">`;
            options.forEach(opt => {
                // Segurança extra no loop
                if (!opt) return;

                const safeOpt = opt.replace(/"/g, '&quot;');
                const isCorrect = (opt === correctDef);
                html += `<button class="quiz-option" onclick="window.checkQuizAnswer(this, ${isCorrect})">${opt}</button>`;
            });
            html += `</div>`;
        }

        html += `</div>`;
        els.content.innerHTML = html;

    } catch (err) {
        console.error(err);
        // Se ainda assim der erro, limpa o peso da chave atual para não ficar em loop infinito
        const badKey = draftItem(); // Pega a chave que provavelmente causou o erro
        if (badKey && weights[badKey]) {
            delete weights[badKey];
            saveWeights();
        }
        els.content.innerHTML = `<p style='color:red; text-align:center'>Erro recuperável. Tente clicar em Próximo ou recarregar.<br><small>${err.message}</small></p><button onclick="nextRound()" style="margin-top:10px">Tentar Novamente</button>`;
    }
}

window.checkQuizAnswer = function (btnElement, isCorrect) {
    const container = btnElement.parentElement;
    const allBtns = container.querySelectorAll('.quiz-option');

    if (isCorrect) {
        // ACERTOU
        btnElement.classList.add('correct');
        // window.speak(currentItem.key); // Fala a palavra ao acertar (opcional)

        allBtns.forEach(b => b.disabled = true);
        els.nextBtn.classList.remove('hidden');

        // Se acertou de primeira, sucesso = true
        updateWeight(currentItem.key, quizAttempts === 0);
    } else {
        // ERROU
        btnElement.classList.add('wrong');
        btnElement.disabled = true;
        quizAttempts++;

        const remaining = container.querySelectorAll('.quiz-option:not(.wrong)');
        if (remaining.length === 1) {
            remaining[0].classList.add('correct');
            remaining[0].disabled = true;
            els.nextBtn.classList.remove('hidden');
            updateWeight(currentItem.key, false);
        }
    }
};

function reveal() {
    if (currentState.mode === 'quiz') return;

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
    else {
        if (qnaStep === 0) {
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
    if (currentState.mode !== 'quiz') {
        updateWeight(currentItem.key, true);
    }
}

window.speak = function (text) {
    if (!text) return;
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

// Listeners
els.revealBtn.onclick = reveal;
els.nextBtn.onclick = nextRound;

els.hsk.onchange = (e) => {
    currentState.hsk = e.target.value;
    localStorage.setItem('last_hsk', currentState.hsk);
    loadWeights();
    nextRound();
};

els.mode.onchange = (e) => {
    // Força limpeza visual antes de carregar lógica
    els.content.innerHTML = '';

    currentState.mode = e.target.value;
    localStorage.setItem('last_mode', currentState.mode);

    // Pequeno timeout para garantir que a renderização da limpeza ocorra 
    // antes do cálculo pesado (se houver muitos dados)
    setTimeout(() => {
        loadWeights();
        nextRound();
    }, 10);
};

init();