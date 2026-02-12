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

    const vocabModes = ['vocab', 'quiz', 'listening', 'reading', 'tones', 'reverse'];

    if (vocabModes.includes(currentState.mode)) {
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

// --- Helpers de Pinyin e Tons ---
function splitPinyin(text) {
    if (!text) return { han: '', pin: '' };
    text = text.normalize('NFC');
    const regex = /^(.+?)\s*\(([^()]*)\)\s*$/;
    const match = text.match(regex);
    if (match) return { han: match[1], pin: match[2] };
    return { han: text, pin: '' };
}

// NOVO: Extrai padrão de tons (ex: "míngtiān" -> "2-1")
function extractTonePattern(pinyinStr, hanziStr) {
    if (!pinyinStr) return "";

    // Mapa de vogais acentuadas para números
    const toneMap = {
        'ā': 1, 'ē': 1, 'ī': 1, 'ō': 1, 'ū': 1, 'ǖ': 1,
        'á': 2, 'é': 2, 'í': 2, 'ó': 2, 'ú': 2, 'ǘ': 2,
        'ǎ': 3, 'ě': 3, 'ǐ': 3, 'ǒ': 3, 'ǔ': 3, 'ǚ': 3,
        'à': 4, 'è': 4, 'ì': 4, 'ò': 4, 'ù': 4, 'ǜ': 4
    };

    let tones = [];
    // Substitui vogais acentuadas pelos números temporariamente para preservar a ordem
    // e remover o resto para contar
    let tempStr = pinyinStr;

    // Contar caracteres Hanzi (ignora pontuação comum se houver)
    const hanziLen = hanziStr.replace(/[^\u4e00-\u9fa5]/g, '').length || 1;

    // Varre a string buscando acentos
    for (let char of pinyinStr) {
        if (toneMap[char]) {
            tones.push(toneMap[char]);
        }
    }

    // Lógica para tons neutros (5):
    // Se temos menos tons encontrados do que caracteres Hanzi, assumimos que os restantes são neutros (5)
    // Geralmente o neutro fica no final em palavras compostas (ex: xièxie -> 4-5)
    while (tones.length < hanziLen) {
        tones.push(5);
    }

    // Segurança: se pegou tons demais (raro), corta
    if (tones.length > hanziLen) tones = tones.slice(0, hanziLen);

    return tones.join("-");
}

// NOVO: Gera distratores de tons
function generateToneDistractors(correctPattern) {
    const parts = correctPattern.split('-');
    const len = parts.length;
    const distractors = new Set();

    // Tenta gerar 3 opções únicas
    let attempts = 0;
    while (distractors.size < 2 && attempts < 50) {
        let fake = [];
        for (let i = 0; i < len; i++) {
            // Gera tom aleatório entre 1 e 5
            fake.push(Math.floor(Math.random() * 5) + 1);
        }
        let fakeStr = fake.join('-');
        if (fakeStr !== correctPattern) {
            distractors.add(fakeStr);
        }
        attempts++;
    }
    return Array.from(distractors);
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
            <!-- Botão de áudio -->
            <button id="block-audio-btn" onclick="window.speak(\`${cleanHan}\`)" class="audio-btn" title="Ouvir">
                <span class="material-icons-round">volume_up</span>
            </button>
        </div>
    </div>`;
}

function renderQuizOptions(correctOption, distractors) {
    const options = [correctOption, ...distractors].sort(() => 0.5 - Math.random());
    let html = `<div class="quiz-container">`;
    options.forEach(opt => {
        if (!opt) return;
        const safeOpt = opt.replace(/"/g, '&quot;');
        const isCorrect = (opt === correctOption);
        html += `<button class="quiz-option" onclick="window.checkQuizAnswer(this, ${isCorrect})">${opt}</button>`;
    });
    html += `</div>`;
    return html;
}

// --- Core ---
function nextRound() {
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

        // MODOS BASEADOS EM VOCABULÁRIO
        if (['vocab', 'quiz', 'listening', 'reading', 'tones', 'reverse'].includes(currentState.mode)) {
            const vocabDef = data.vocab[key];
            if (!vocabDef || typeof vocabDef !== 'string') {
                delete weights[key]; saveWeights(); nextRound(); return;
            }

            currentItem = { key: key, data: vocabDef };

            // A. Vocabulário Normal
            if (currentState.mode === 'vocab') {
                html += renderBlock(key, 'Termo');
                html += `<div id="part-pt"></div>`;
            }
            // B. Quiz (Hanzi -> PT)
            else if (currentState.mode === 'quiz') {
                els.revealBtn.classList.add('hidden');
                html += renderBlock(key, 'Quiz');
                const distractors = Object.values(data.vocab)
                    .filter(d => d && d !== vocabDef && typeof d === 'string')
                    .sort(() => 0.5 - Math.random()).slice(0, 2);
                html += renderQuizOptions(vocabDef, distractors);
            }
            // C. Audição (Ouvir -> PT)
            else if (currentState.mode === 'listening') {
                els.revealBtn.classList.add('hidden');
                const { han } = splitPinyin(key);
                html += `
                <div class="listening-container">
                    <button class="big-audio-btn" onclick="window.speak('${han}')">
                        <span class="material-icons-round">volume_up</span>
                    </button>
                </div>
                <div style="text-align:center; margin-bottom:15px; color:var(--text-sec); font-size:0.9rem">Clique para ouvir</div>`;
                const distractors = Object.values(data.vocab)
                    .filter(d => d && d !== vocabDef && typeof d === 'string')
                    .sort(() => 0.5 - Math.random()).slice(0, 2);
                html += renderQuizOptions(vocabDef, distractors);
                html += `<div id="listening-reveal" class="hidden fade-in" style="margin-top:20px; border-top:1px dashed var(--border); padding-top:15px">
                            ${renderBlock(key, 'Resposta Correta')}
                         </div>`;
            }
            // D. Leitura (Hanzi -> Pinyin)
            else if (currentState.mode === 'reading') {
                els.revealBtn.classList.add('hidden');
                const { han, pin } = splitPinyin(key);
                if (!pin) { delete weights[key]; saveWeights(); nextRound(); return; }

                // Mostra Hanzi e esconde Áudio
                html += `
                <div class="cn-block">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                             <span class="label">Leitura</span>
                             <div class="chinese-text">${han}</div>
                        </div>
                        <button id="reading-audio-btn" onclick="window.speak('${han}')" class="audio-btn hidden" title="Ouvir">
                            <span class="material-icons-round">volume_up</span>
                        </button>
                    </div>
                </div>`;

                const allKeys = Object.keys(data.vocab);
                const pinyinDistractors = [];
                let attempts = 0;
                while (pinyinDistractors.length < 2 && attempts < 50) {
                    const randomKey = allKeys[Math.floor(Math.random() * allKeys.length)];
                    const parts = splitPinyin(randomKey);
                    if (parts.pin && parts.pin !== pin && !pinyinDistractors.includes(parts.pin)) {
                        pinyinDistractors.push(parts.pin);
                    }
                    attempts++;
                }
                html += renderQuizOptions(pin, pinyinDistractors);
                html += `<div id="reading-reveal" class="hidden fade-in" style="margin-top:20px; text-align:center; color:var(--text-sec)">
                            Tradução: ${vocabDef}
                         </div>`;
            }
            // E. TONS (Hanzi -> Padrão de Tons ex: 1-4)
            else if (currentState.mode === 'tones') {
                els.revealBtn.classList.add('hidden');
                const { han, pin } = splitPinyin(key);

                // Calcula o padrão correto (ex: "2-1")
                const correctPattern = extractTonePattern(pin, han);

                // Se não conseguir extrair, pula
                if (!correctPattern) { delete weights[key]; saveWeights(); nextRound(); return; }

                // Mostra Hanzi e Botão de Áudio (importante para "ouvir" o tom)
                html += `
                <div class="cn-block">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                             <span class="label">Qual o Tom?</span>
                             <div class="chinese-text">${han}</div>
                        </div>
                        <button onclick="window.speak('${han}')" class="audio-btn" title="Ouvir">
                            <span class="material-icons-round">volume_up</span>
                        </button>
                    </div>
                </div>`;

                // Gera opções de tons (ex: 2-1, 1-4, 3-3)
                const toneDistractors = generateToneDistractors(correctPattern);
                html += renderQuizOptions(correctPattern, toneDistractors);

                // Feedback visual final
                html += `<div id="tones-reveal" class="hidden fade-in" style="margin-top:20px; text-align:center;">
                            <div class="pinyin-text" style="font-size:1.4rem; color:var(--accent)">${pin}</div>
                            <div style="color:var(--text-sec); margin-top:5px">Tradução: ${vocabDef}</div>
                         </div>`;
            }
            // F. Inverso (PT -> Hanzi)
            else if (currentState.mode === 'reverse') {
                els.revealBtn.innerText = "Mostrar Chinês";
                html += `
                <div class="fade-in">
                    <span class="label">Tradução</span>
                    <div class="chinese-text" style="font-size:1.4rem; color:var(--text)">${vocabDef}</div>
                </div>
                <div id="part-pt"></div>`;
            }
        }

        // MODOS TEXTO / QNA
        else if (currentState.mode === 'text') {
            const item = data.text.find(x => x.id === key);
            if (!item) { delete weights[key]; saveWeights(); nextRound(); return; }
            currentItem = { key: key, data: item };
            html += renderBlock(item.cn, 'Texto');
            html += `<div id="part-pt"></div>`;
        }
        else if (currentState.mode === 'qna') {
            els.revealBtn.innerText = "Mostrar Resposta";
            const item = data.qna.find(x => x.id === key);
            if (!item) { delete weights[key]; saveWeights(); nextRound(); return; }
            currentItem = { key: key, data: item };
            html += renderBlock(item.cn.q, 'Pergunta');
            html += `<div id="qna-answer"></div>`;
            html += `<div id="part-pt"></div>`;
        }

        html += `</div>`;
        els.content.innerHTML = html;

    } catch (err) {
        console.error(err);
        const badKey = draftItem();
        if (badKey && weights[badKey]) { delete weights[badKey]; saveWeights(); }
        els.content.innerHTML = `<p style='color:red; text-align:center'>Erro. Tente recarregar.</p><button onclick="nextRound()">Pular</button>`;
    }
}

window.checkQuizAnswer = function (btnElement, isCorrect) {
    const container = btnElement.parentElement;
    const allBtns = container.querySelectorAll('.quiz-option');

    const showFinalFeedback = () => {
        if (currentState.mode === 'listening') {
            document.getElementById('listening-reveal').classList.remove('hidden');
        }
        if (currentState.mode === 'reading') {
            document.getElementById('reading-reveal').classList.remove('hidden');
            const audioBtn = document.getElementById('reading-audio-btn');
            if (audioBtn) audioBtn.classList.remove('hidden');
        }
        // NOVO: Feedback para Tons
        if (currentState.mode === 'tones') {
            document.getElementById('tones-reveal').classList.remove('hidden');
        }
    };

    if (isCorrect) {
        btnElement.classList.add('correct');
        allBtns.forEach(b => b.disabled = true);
        els.nextBtn.classList.remove('hidden');
        showFinalFeedback();
        updateWeight(currentItem.key, quizAttempts === 0);
    } else {
        btnElement.classList.add('wrong');
        btnElement.disabled = true;
        quizAttempts++;

        const remaining = container.querySelectorAll('.quiz-option:not(.wrong)');
        if (remaining.length === 1) {
            remaining[0].classList.add('correct');
            remaining[0].disabled = true;
            els.nextBtn.classList.remove('hidden');
            showFinalFeedback();
            updateWeight(currentItem.key, false);
        }
    }
};

function reveal() {
    // Modos de Quiz não usam esse botão
    if (['quiz', 'listening', 'reading', 'tones'].includes(currentState.mode)) return;

    if (currentState.mode === 'reverse') {
        const ptDiv = document.getElementById('part-pt');
        ptDiv.innerHTML = `
            <div class="solid-divider"></div>
            <div class="fade-in">
                ${renderBlock(currentItem.key, 'Chinês')}
            </div>
        `;
        finishRound();
        return;
    }

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
    if (!['quiz', 'listening', 'reading', 'tones'].includes(currentState.mode)) {
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
    els.content.innerHTML = '';
    currentState.mode = e.target.value;
    localStorage.setItem('last_mode', currentState.mode);
    setTimeout(() => {
        loadWeights();
        nextRound();
    }, 10);
};

init();