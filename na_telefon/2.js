(() => {
  // ====== Размеры ======
  const COLS = 12;
  const ROWS = 20;
  const CELL = 26;
  const GAP  = 1;

  // ====== Канвасы ======
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nctx = nextCanvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  // ====== UI ======
  const elScore = document.getElementById('score');
  const elLines = document.getElementById('lines');
  const elLevel = document.getElementById('level');
  const elSpeed = document.getElementById('speed');
  const elBest  = document.getElementById('best');
  const elStatus = document.getElementById('status');
  const elMode = document.getElementById('mode');

  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');
  const btnStart = document.getElementById('btnStart');
  const btnResetDown = document.getElementById('btnResetDown');

  const toggleSound = document.getElementById('toggleSound');
  const toggleGhost = document.getElementById('toggleGhost');
  const soundPill = document.getElementById('soundPill');
  const ghostPill = document.getElementById('ghostPill');

  // Mobile buttons
  const mLeft   = document.getElementById('mLeft');
  const mRight  = document.getElementById('mRight');
  const mRotate = document.getElementById('mRotate');
  const mDown   = document.getElementById('mDown');
  const mDrop   = document.getElementById('mDrop');
  const mPause  = document.getElementById('mPause');
  const mRestart= document.getElementById('mRestart');

  // ====== Цвета ======
  const COLORS = {
    I: '#4ee6ff',
    O: '#ffd84e',
    T: '#b88cff',
    S: '#5cff9a',
    Z: '#ff6b6b',
    J: '#66a3ff',
    L: '#ffb86b',
    GHOST: 'rgba(232,238,255,0.14)',
    EMPTY: 'rgba(17,26,51,0.35)',
    FLASH: 'rgba(255,255,255,0.55)'
  };

  // ====== Звук (без файлов, WebAudio) ======
  let audioCtx = null;
  let soundOn = true;

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    return audioCtx;
  }

  function beep({freq=440, type='sine', dur=0.06, gain=0.06, slide=0} = {}) {
    const ac = ensureAudio();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), ac.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur + 0.02);
  }

  const SFX = {
    move(){ beep({freq:260,type:'square',dur:0.03,gain:0.035}); },
    rotate(){ beep({freq:420,type:'triangle',dur:0.045,gain:0.045,slide:1.3}); },
    soft(){ beep({freq:200,type:'sine',dur:0.02,gain:0.03}); },
    hard(){ beep({freq:120,type:'sawtooth',dur:0.07,gain:0.05,slide:0.7}); },
    lock(){ beep({freq:160,type:'square',dur:0.04,gain:0.04}); },
    line(n){
      const base = 520 + n*80;
      beep({freq:base,type:'triangle',dur:0.08,gain:0.06});
      setTimeout(()=>beep({freq:base*1.25,type:'triangle',dur:0.08,gain:0.045}), 35);
      setTimeout(()=>beep({freq:base*1.5,type:'triangle',dur:0.08,gain:0.04}), 70);
    },
    over(){
      beep({freq:180,type:'sawtooth',dur:0.18,gain:0.07,slide:0.5});
      setTimeout(()=>beep({freq:120,type:'sawtooth',dur:0.2,gain:0.06,slide:0.5}), 120);
    }
  };

  // ====== Фигуры (базовые) ======
  const BASE = {
    I: [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0],
    ],
    O: [
      [1,1],
      [1,1],
    ],
    T: [
      [0,1,0],
      [1,1,1],
      [0,0,0],
    ],
    S: [
      [0,1,1],
      [1,1,0],
      [0,0,0],
    ],
    Z: [
      [1,1,0],
      [0,1,1],
      [0,0,0],
    ],
    J: [
      [1,0,0],
      [1,1,1],
      [0,0,0],
    ],
    L: [
      [0,0,1],
      [1,1,1],
      [0,0,0],
    ],
  };
  const TYPES = Object.keys(BASE);

  function rotateCW(mat){
    const h = mat.length, w = mat[0].length;
    const res = Array.from({length:w},()=>Array(h).fill(0));
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) res[x][h-1-y]=mat[y][x];
    return res;
  }
  function precomputeRotations(){
    const rot = {};
    for (const t of TYPES){
      rot[t] = [];
      rot[t][0] = BASE[t].map(r=>r.slice());
      for (let i=1;i<4;i++) rot[t][i] = rotateCW(rot[t][i-1]);
    }
    return rot;
  }
  const ROT = precomputeRotations();

  // ====== SRS kick tables (clockwise) ======
  const JLSTZ_KICKS = {
    "0>1": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "1>2": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    "2>3": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "3>0": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  };
  const I_KICKS = {
    "0>1": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    "1>2": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    "2>3": [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    "3>0": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  };

  function kickList(type, from, to){
    if (type === 'O') return [[0,0]];
    const key = `${from}>${to}`;
    if (type === 'I') return I_KICKS[key] || [[0,0]];
    return JLSTZ_KICKS[key] || [[0,0]];
  }

  // ====== Игра ======
  let board;
  let bag = [];
  let current, next;

  let score = 0, lines = 0, level = 1;
  let dropInterval = 800;
  let dropAcc = 0;
  let lastTime = 0;

  let paused = false;
  let gameOver = false;
  let started = false;

  // Line clear animation state
  let clearing = null; // {rows:[...], t:0, phase:0}
  const CLEAR_FLASH_MS = 220; // total flash time

  // Settings
  let showGhost = true;

  // Best score
  const LS_BEST = 'tetris_pro_best_v1';
  let best = 0;

  function loadBest(){
    const v = Number(localStorage.getItem(LS_BEST) || '0');
    best = Number.isFinite(v) ? v : 0;
    elBest.textContent = best;
  }
  function saveBest(){
    if (score > best){
      best = score;
      localStorage.setItem(LS_BEST, String(best));
      elBest.textContent = best;
    }
  }

  function setStatus(t){ elStatus.textContent = t; }
  function setMode(t){ elMode.textContent = t; }

  function syncUI(){
    elScore.textContent = score;
    elLines.textContent = lines;
    elLevel.textContent = level;
    elSpeed.textContent = `${(800 / dropInterval).toFixed(2)}x`;
    elBest.textContent = best;
    soundPill.textContent = soundOn ? 'ON' : 'OFF';
    ghostPill.textContent = showGhost ? 'ON' : 'OFF';
  }

  function makeBoard(){
    return Array.from({length: ROWS}, () => Array(COLS).fill(null));
  }

  // ====== 7-bag ======
  function shuffle(arr){
    for (let i=arr.length-1;i>0;i--){
      const j = (Math.random()*(i+1))|0;
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }
  function refillBag(){
    bag = shuffle(TYPES.slice());
  }
  function drawFromBag(){
    if (!bag.length) refillBag();
    const type = bag.pop();
    return createPiece(type);
  }

  function createPiece(type){
    const shape = ROT[type][0];
    return {
      type,
      rot: 0,
      shape,
      x: ((COLS/2)|0) - ((shape[0].length/2)|0),
      y: -1
    };
  }

  function reset(){
    board = makeBoard();
    score = 0; lines = 0; level = 1;
    dropInterval = 800;
    dropAcc = 0; lastTime = 0;
    paused = false; gameOver = false; started = false;
    clearing = null;

    refillBag();
    current = drawFromBag();
    next = drawFromBag();

    setMode('RUN');
    setStatus('Готово. Жми любую клавишу или кнопку на экране, чтобы начать.');
    loadBest();
    syncUI();
    initQuiz();
    draw();
  }

  // ====== Коллизии / merge ======
  function collide(piece, offX=0, offY=0, testShape=null){
    const shape = testShape || piece.shape;
    for (let y=0;y<shape.length;y++){
      for (let x=0;x<shape[y].length;x++){
        if (!shape[y][x]) continue;
        const px = piece.x + x + offX;
        const py = piece.y + y + offY;
        if (px < 0 || px >= COLS || py >= ROWS) return true;
        if (py >= 0 && board[py][px]) return true;
      }
    }
    return false;
  }

  function merge(piece){
    const {shape, type} = piece;
    for (let y=0;y<shape.length;y++){
      for (let x=0;x<shape[y].length;x++){
        if (!shape[y][x]) continue;
        const bx = piece.x + x;
        const by = piece.y + y;
        if (by >= 0) board[by][bx] = type;
      }
    }
  }

  // ====== Очистка линий + анимация ======
  function findFullRows(){
    const rows = [];
    for (let y=0;y<ROWS;y++){
      if (board[y].every(c=>c!==null)) rows.push(y);
    }
    return rows;
  }

  function startClearAnimation(rows){
    clearing = { rows, t: 0 };
  }

  function applyClear(rows){
    rows.sort((a,b)=>a-b);
    for (let i=rows.length-1;i>=0;i--){
      const y = rows[i];
      board.splice(y,1);
      board.unshift(Array(COLS).fill(null));
    }

    const cleared = rows.length;
    const points = [0,100,300,500,800][cleared] || (cleared*250);
    score += points * level;
    lines += cleared;

    const newLevel = 1 + Math.floor(lines / 10);
    if (newLevel !== level){
      level = newLevel;
      dropInterval = Math.max(90, 800 - (level - 1) * 60);
    }

    SFX.line(cleared);
    saveBest();
    syncUI();
    // Queue quizzes: one quiz per cleared line
    if (window.QUIZ_WORDS && cleared > 0){
      quizQueue = cleared;
      paused = true;
      setStatus('Викторина: ответьте на вопрос, чтобы продолжить.');
      showNextQuiz();
    }
  }

  // ====== SRS rotation ======
  function tryRotateCW(){
    if (paused || gameOver || clearing) return false;
    started = true;

    const from = current.rot;
    const to = (from + 1) & 3;
    const testShape = ROT[current.type][to];

    const kicks = kickList(current.type, from, to);
    for (const [dx,dy] of kicks){
      if (!collide(current, dx, dy, testShape)){
        current.rot = to;
        current.shape = testShape;
        current.x += dx;
        current.y += dy;
        SFX.rotate();
        draw();
        return true;
      }
    }
    return false;
  }

  // ====== Spawn/lock ======
  function lockAndSpawn(){
    merge(current);
    SFX.lock();

    const full = findFullRows();
    if (full.length){
      startClearAnimation(full);
    }

    current = next;
    next = drawFromBag();

    if (collide(current, 0, 0)){
      gameOver = true;
      setMode('GAME OVER');
      setStatus('Игра окончена. Нажми R / RESTART.');
      SFX.over();
      saveBest();
      // show leaderboard and offer to save record
      setTimeout(()=>{
        if (recordName) recordName.value = '';
        showLeaderboard();
      }, 300);
    }
  }

  // ====== Drop ======
  function hardDrop(){
    if (paused || gameOver || clearing) return;
    started = true;
    let steps = 0;
    while (!collide(current, 0, 1)){
      current.y++;
      steps++;
    }
    score += Math.min(steps, 40) * 2; // бонус
    SFX.hard();
    lockAndSpawn();
    saveBest();
    syncUI();
    draw();
  }

  function softDrop(stepScore=true){
    if (paused || gameOver || clearing) return;
    started = true;

    if (!collide(current, 0, 1)){
      current.y++;
      if (stepScore){
        score += 1;
        saveBest();
        syncUI();
        SFX.soft();
      }
    } else {
      lockAndSpawn();
    }
    draw();
  }

  // ====== Отрисовка ======
  function drawCell(context, x, y, color){
    const px = x * CELL;
    const py = y * CELL;
    context.fillStyle = color;
    context.fillRect(px + GAP, py + GAP, CELL - GAP*2, CELL - GAP*2);
  }

  function drawGrid(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let y=0;y<ROWS;y++){
      for (let x=0;x<COLS;x++){
        drawCell(ctx, x, y, COLORS.EMPTY);
      }
    }
  }

  function drawBoard(){
    drawGrid();
    for (let y=0;y<ROWS;y++){
      for (let x=0;x<COLS;x++){
        const t = board[y][x];
        if (t) drawCell(ctx, x, y, COLORS[t]);
      }
    }
  }

  function drawPiece(piece, colorOverride=null){
    const {shape, type} = piece;
    const color = colorOverride || COLORS[type];
    for (let y=0;y<shape.length;y++){
      for (let x=0;x<shape[y].length;x++){
        if (!shape[y][x]) continue;
        const bx = piece.x + x;
        const by = piece.y + y;
        if (by >= 0) drawCell(ctx, bx, by, color);
      }
    }
  }

  function getGhostY(piece){
    let gy = piece.y;
    while (!collide(piece, 0, (gy - piece.y) + 1)) gy++;
    return gy;
  }

  function drawNext(){
    nctx.clearRect(0,0,nextCanvas.width,nextCanvas.height);
    const cell = Math.floor(nextCanvas.width / 5);

    nctx.fillStyle = 'rgba(17,26,51,0.55)';
    nctx.fillRect(0,0,nextCanvas.width,nextCanvas.height);

    const shape = next.shape;
    const color = COLORS[next.type];

    const h = shape.length, w = shape[0].length;
    const ox = ((5 - w) / 2);
    const oy = ((5 - h) / 2);

    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        if (!shape[y][x]) continue;
        const px = (ox + x) * cell;
        const py = (oy + y) * cell;
        nctx.fillStyle = color;
        nctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      }
    }
  }

  function drawClearingFlash(){
    if (!clearing) return;
    const phase = (clearing.t / 60) | 0;
    const on = (phase % 2) === 0;

    if (!on) return;
    for (const ry of clearing.rows){
      for (let x=0;x<COLS;x++){
        drawCell(ctx, x, ry, COLORS.FLASH);
      }
    }
  }

  function draw(){
    drawBoard();

    if (!gameOver){
      if (showGhost && !clearing){
        const gy = getGhostY(current);
        drawPiece({...current, y: gy}, COLORS.GHOST);
      }
      drawPiece(current);
    }

    if (clearing){
      drawClearingFlash();
    }

    drawNext();

    if (paused && !gameOver){
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = 'rgba(232,238,255,0.92)';
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пауза', canvas.width/2, canvas.height/2);
    }

    if (gameOver){
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2 - 8);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232,238,255,0.85)';
      ctx.fillText('Нажми R / RESTART', canvas.width/2, canvas.height/2 + 18);
    }
  }

  // ====== Game loop ======
  function update(time=0){
    const dt = time - lastTime;
    lastTime = time;

    if (!paused && !gameOver){
      if (clearing){
        clearing.t += dt;
        if (clearing.t >= CLEAR_FLASH_MS){
          const rows = clearing.rows;
          clearing = null;
          applyClear(rows);
          draw();
        } else {
          draw();
        }
      } else if (started){
        dropAcc += dt;
        if (dropAcc >= dropInterval){
          dropAcc = 0;
          softDrop(false);
        }
      }
    }

    requestAnimationFrame(update);
  }

  // ====== Controls ======
  function togglePause(){
    if (gameOver) return;
    if (clearing) return;
    paused = !paused;
    setMode(paused ? 'PAUSE' : 'RUN');
    setStatus(paused ? 'Пауза. Нажми P чтобы продолжить.' : 'Продолжай!');
    draw();
  }

  function restart(){
    reset();
  }

  function startIfNeeded(){
    if (!started && !gameOver){
      started = true;
      setStatus('Игра началась!');
      ensureAudio();
    }
  }

  function move(dx){
    if (paused || gameOver || clearing) return;
    startIfNeeded();
    if (!collide(current, dx, 0)){
      current.x += dx;
      SFX.move();
      draw();
    }
  }

  function onKey(e){
    if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space'].includes(e.code)) e.preventDefault();

    if (e.code === 'KeyP'){ startIfNeeded(); togglePause(); return; }
    if (e.code === 'KeyR'){ restart(); return; }

    if (paused || gameOver) return;
    if (clearing) return;

    startIfNeeded();

    switch (e.code){
      case 'ArrowLeft':  move(-1); break;
      case 'ArrowRight': move(1); break;
      case 'ArrowDown':  softDrop(true); break;
      case 'ArrowUp':    tryRotateCW(); break;
      case 'Space':      hardDrop(); break;
    }
  }

  window.addEventListener('keydown', onKey, {passive:false});

  // Focus
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  canvas.addEventListener('click', () => { canvas.focus(); startIfNeeded(); });

  // ====== Toggles ======
  function setSound(on){
    soundOn = !!on;
    if (!soundOn && audioCtx){ }
    syncUI();
  }
  function setGhost(on){
    showGhost = !!on;
    syncUI();
    draw();
  }

  function wireToggle(el, fn){
    el.addEventListener('click', () => { startIfNeeded(); fn(); });
    el.addEventListener('keydown', (e)=>{
      if (e.code === 'Enter' || e.code === 'Space'){
        e.preventDefault();
        startIfNeeded();
        fn();
      }
    });
  }

  wireToggle(toggleSound, () => {
    setSound(!soundOn);
    if (soundOn) { ensureAudio(); SFX.rotate(); }
  });
  wireToggle(toggleGhost, () => setGhost(!showGhost));

  // ====== Quiz / Leaderboard state ======
  let quizOrder = [];
  let quizIdx = 0;
  let quizQueue = 0; // number of pending quizzes to show
  let quizActive = false;
  let quizStartTime = 0;
  const MAX_BONUS = 500; // max bonus points for instant answer

  function initQuiz(){
    if (!window.QUIZ_WORDS) window.QUIZ_WORDS = [];
    quizOrder = [...window.QUIZ_WORDS];
    // shuffle
    for (let i=quizOrder.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [quizOrder[i],quizOrder[j]]=[quizOrder[j],quizOrder[i]]; }
    quizIdx = 0;
  }

  // UI refs for quiz
  const quizOverlay = document.getElementById('quizOverlay');
  const quizPrompt = document.getElementById('quizPrompt');
  const quizSelectionEl = document.getElementById('quizSelection');
  const quizOptions = document.getElementById('quizOptions');
  const quizTimer = document.getElementById('quizTimer');
  const quizBack = document.getElementById('quizBack');
  const quizClear = document.getElementById('quizClear');
  const quizBonusEl = document.getElementById('quizBonus');
  const quizCurrentBonusEl = document.getElementById('quizCurrentBonus');
  const quizConfirm = document.getElementById('quizConfirm');

  let quizTimerInterval = null;

  let currentQuiz = null;
  let currentSelection = [];

  function renderSelectionDisplay(count){
    quizSelectionEl.innerHTML = '';
    for (let i=0;i<count;i++){
      const span = document.createElement('span');
      span.className = 'sel-slot';
      span.textContent = currentSelection[i] || '_';
      quizSelectionEl.appendChild(span);
    }
    if (quizConfirm) quizConfirm.disabled = !(currentSelection.length === count);
  }

  quizBack.addEventListener('click', (e)=>{
    e.preventDefault();
    if (!quizActive) return;
    currentSelection.pop();
    renderSelectionDisplay(currentQuiz ? currentQuiz.answers.length : 0);
  });
  quizClear.addEventListener('click', (e)=>{
    e.preventDefault();
    if (!quizActive) return;
    currentSelection = [];
    renderSelectionDisplay(currentQuiz ? currentQuiz.answers.length : 0);
  });

  if (quizConfirm) quizConfirm.addEventListener('click', (e)=>{
    e.preventDefault();
    if (!quizActive || !currentQuiz) return;
    submitQuizAnswer(currentQuiz);
  });

  function showNextQuiz(){
    if (quizQueue <= 0){ paused = false; setStatus('Продолжай!'); draw(); return; }
    if (quizIdx >= quizOrder.length) initQuiz();
    const q = quizOrder[quizIdx++];
    quizActive = true;
    quizStartTime = performance.now();
    quizOverlay.style.display = 'flex';
    quizPrompt.textContent = q.prompt;
    currentQuiz = q;
    currentSelection = [];
    // Build options list: prefer per-item `q.options`, otherwise derive vowels from the quiz list
    let optionsList = [];
    if (q.options){
      if (Array.isArray(q.options)) optionsList = q.options.map(x=>String(x).toLowerCase());
      else optionsList = String(q.options).split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    }

    if (!optionsList.length){
      const baseVowels = ['а','е','ё','и','о','у','ы','э','ю','я'];
      const present = new Set();
      const sourceList = window.QUIZ_WORDS || quizOrder || [];
      for (const item of sourceList){
        const texts = [];
        if (item.full) texts.push(item.full);
        if (item.prompt) texts.push(item.prompt);
        if (item.answers) texts.push(...item.answers);
        if (item.answer) texts.push(item.answer);
        for (const txt of texts){
          for (const ch of String(txt).toLowerCase()){
            if (baseVowels.includes(ch)) present.add(ch);
          }
        }
      }
      optionsList = present.size ? Array.from(present) : baseVowels;
    }

    // normalize/dedupe
    optionsList = Array.from(new Set(optionsList.map(s=>String(s).toLowerCase())));

    // If options were provided explicitly, show exactly them in order; otherwise use derived list
    const displayOptions = optionsList.slice();

    quizOptions.innerHTML = '';
    for (const opt of displayOptions){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt;
      btn.addEventListener('click', ()=>{
        if (!quizActive) return;
        // allow selecting repeatedly; append until slots filled
        const needed = Array.isArray(q.answers) ? q.answers.length : (String(q.prompt).split('_').length - 1);
        if (currentSelection.length >= needed) return;
        currentSelection.push(opt);
        renderSelectionDisplay(needed);
        // enable confirm when filled
        if (quizConfirm) quizConfirm.disabled = !(currentSelection.length === needed);
      });
      quizOptions.appendChild(btn);
    }
    // render empty selection slots
    const needed = Array.isArray(q.answers) ? q.answers.length : (String(q.prompt).split('_').length - 1);
    renderSelectionDisplay(needed);
    if (quizConfirm) quizConfirm.disabled = true;
    // timer and bonus displays
    if (quizBonusEl) quizBonusEl.textContent = `Максимум бонуса: ${MAX_BONUS}`;
    if (quizCurrentBonusEl) quizCurrentBonusEl.textContent = `Бонус сейчас: ${MAX_BONUS}`;
    quizTimer.textContent = '0.0s';
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(()=>{
      const elapsed = (performance.now()-quizStartTime)/1000;
      const s = elapsed.toFixed(1);
      quizTimer.textContent = s + 's';
      const t = Math.min(elapsed, 10);
      const bonusNow = Math.round((1 - t/10) * MAX_BONUS);
      if (quizCurrentBonusEl) quizCurrentBonusEl.textContent = `Бонус сейчас: ${bonusNow}`;
    }, 100);
  }

  function submitQuizAnswer(q){
    if (!quizActive) return;
    const elapsed = (performance.now() - quizStartTime) / 1000;
    const correctAnswers = Array.isArray(q.answers) && q.answers.length ? q.answers.map(s=>String(s).toLowerCase()) : (q.answer ? [String(q.answer).toLowerCase()] : []);
    // compare arrays element-wise
    const ok = (currentSelection.length === correctAnswers.length) && currentSelection.every((v,i)=>String(v).toLowerCase() === correctAnswers[i]);
    clearInterval(quizTimerInterval);
    quizTimerInterval = null;
    if (ok){
      const t = Math.min(elapsed, 10);
      const bonus = Math.round((1 - t/10) * MAX_BONUS);
      score += bonus;
      syncUI();
      if (quizCurrentBonusEl) quizCurrentBonusEl.textContent = `Бонус сейчас: 0`;
      // show awarded bonus prominently
      const awardEl = document.getElementById('quizAward');
      if (awardEl){
        awardEl.textContent = `+${bonus}`;
        awardEl.style.display = 'block';
        awardEl.classList.add('show');
      }
      quizSelectionEl.classList.add('correct');
      // keep visible so child can see the bonus, then close
      setTimeout(()=>{
        if (awardEl){ awardEl.classList.remove('show'); awardEl.style.display = 'none'; }
        quizSelectionEl.classList.remove('correct');
        quizOverlay.style.display = 'none';
        quizActive = false;
        quizQueue--; // consume one quiz
        if (quizQueue > 0) showNextQuiz(); else { paused = false; setStatus('Продолжай!'); draw(); }
      }, 1400);
    } else {
      // wrong: show feedback and clear selection for retry
      quizSelectionEl.classList.add('wrong');
      setTimeout(()=>{ quizSelectionEl.classList.remove('wrong'); currentSelection = []; renderSelectionDisplay(correctAnswers.length); }, 700);
      // restart timer
      quizStartTime = performance.now();
      if (quizTimerInterval) clearInterval(quizTimerInterval);
      quizTimerInterval = setInterval(()=>{ const elapsed2 = (performance.now()-quizStartTime)/1000; const s2 = elapsed2.toFixed(1); quizTimer.textContent = s2 + 's'; const t2 = Math.min(elapsed2,10); const bonus2 = Math.round((1 - t2/10) * MAX_BONUS); if (quizCurrentBonusEl) quizCurrentBonusEl.textContent = `Бонус сейчас: ${bonus2}`; }, 100);
    }
  }

  // Leaderboard storage
  const LB_KEY = 'tetris_quiz_leaderboard_v1';
  function loadLeaderboard(){
    try{ return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); }catch(e){ return []; }
  }
  function saveLeaderboardEntry(name, scoreVal){
    const list = loadLeaderboard();
    list.push({name: name || '---', score: scoreVal, ts: Date.now()});
    list.sort((a,b)=>b.score - a.score);
    while (list.length > 20) list.pop();
    localStorage.setItem(LB_KEY, JSON.stringify(list));
  }

  // Leaderboard UI
  const leaderOverlay = document.getElementById('leaderOverlay');
  const leaderList = document.getElementById('leaderList');
  const saveRecordBtn = document.getElementById('saveRecordBtn');
  const recordName = document.getElementById('recordName');
  const closeLeader = document.getElementById('closeLeader');
  const leaderboardInline = document.getElementById('leaderboardInline');
  const openLeaderBtn = document.getElementById('openLeaderBtn');

  function showLeaderboard(){
    const list = loadLeaderboard();
    leaderList.innerHTML = '';
    if (!list.length) leaderList.textContent = 'Пока нет записей.';
    else{
      const ul = document.createElement('ol');
      for (const it of list) {
        const li = document.createElement('li');
        li.textContent = `${it.name} — ${it.score}`;
        ul.appendChild(li);
      }
      leaderList.appendChild(ul);
    }
    leaderOverlay.style.display = 'flex';
  }

  function renderInlineLeaderboard(){
    if (!leaderboardInline) return;
    const list = loadLeaderboard();
    leaderboardInline.innerHTML = '';
    if (!list.length) {
      leaderboardInline.textContent = 'Пока нет записей.';
      return;
    }
    const ol = document.createElement('ol');
    for (let i=0;i<Math.min(5,list.length);i++){
      const it = list[i];
      const li = document.createElement('li');
      li.textContent = `${it.name} — ${it.score}`;
      ol.appendChild(li);
    }
    leaderboardInline.appendChild(ol);
  }

  saveRecordBtn.addEventListener('click', ()=>{
    const name = recordName.value.trim() || 'Игрок';
    saveLeaderboardEntry(name, score);
    showLeaderboard();
    renderInlineLeaderboard();
  });
  closeLeader.addEventListener('click', ()=>{ leaderOverlay.style.display='none'; });

  if (openLeaderBtn) openLeaderBtn.addEventListener('click', ()=>{ showLeaderboard(); });


  // ====== Buttons ======
  btnStart.addEventListener('click', () => { startIfNeeded(); });
  btnPause.addEventListener('click', () => { startIfNeeded(); togglePause(); });
  btnRestart.addEventListener('click', () => restart());
  if (btnResetDown) btnResetDown.addEventListener('click', () => { startIfNeeded(); hardDrop(); });

  // ====== Mobile: удержание кнопок ======
  function bindHold(btn, onTap, onHold, holdDelay=180, holdRate=55){
    let t0 = null;
    let rep = null;

    const clear = () => {
      if (t0){ clearTimeout(t0); t0 = null; }
      if (rep){ clearInterval(rep); rep = null; }
    };

    const down = (e) => {
      e.preventDefault();
      startIfNeeded();
      onTap();
      t0 = setTimeout(() => {
        rep = setInterval(() => onHold(), holdRate);
      }, holdDelay);
    };
    const up = (e) => { e.preventDefault(); clear(); };

    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  bindHold(mLeft,  () => move(-1), () => move(-1));
  bindHold(mRight, () => move(1),  () => move(1));
  bindHold(mDown,  () => softDrop(true), () => softDrop(true), 120, 45);

  mRotate.addEventListener('click', (e)=>{ e.preventDefault(); startIfNeeded(); tryRotateCW(); });
  mDrop.addEventListener('click',   (e)=>{ e.preventDefault(); startIfNeeded(); hardDrop(); });
  mPause.addEventListener('click',  (e)=>{ e.preventDefault(); startIfNeeded(); togglePause(); });
  mRestart.addEventListener('click',(e)=>{ e.preventDefault(); restart(); });

  // ====== Init ======
  reset();
  requestAnimationFrame(update);
})();
