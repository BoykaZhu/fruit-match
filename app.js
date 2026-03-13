const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');
const comboEl = document.getElementById('combo');
const goalEl = document.getElementById('goal');
const levelEl = document.getElementById('level');
const statusText = document.getElementById('statusText');
const newGameBtn = document.getElementById('newGameBtn');

const fruits = ['🍎', '🍊', '🍇', '🍓', '🍍', '🥝'];
const cols = 6;
const rows = 8;
const baseGoal = 1800;
const baseMoves = 18;
const SWIPE_THRESHOLD = 18;
let board = [];
let score = 0;
let movesLeft = baseMoves;
let combo = 0;
let level = 1;
let busy = false;
let audioCtx = null;
let pointerStart = null;
let activeTile = null;

function goalScore() { return baseGoal + (level - 1) * 700; }
function allowedMoves() { return Math.max(10, baseMoves - (level - 1)); }
function randFruit() { return fruits[Math.floor(Math.random() * fruits.length)]; }

function initBoard() {
  board = Array.from({ length: rows }, () => Array.from({ length: cols }, () => randFruit()));
  while (findMatches().length > 0) refillMatched(findMatches(), false);
}

function render() {
  boardEl.innerHTML = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const btn = document.createElement('button');
      btn.className = 'tile';
      btn.type = 'button';
      btn.dataset.row = r;
      btn.dataset.col = c;
      btn.textContent = board[r][c];
      attachPointerHandlers(btn, r, c);
      boardEl.appendChild(btn);
    }
  }
  scoreEl.textContent = score;
  movesEl.textContent = movesLeft;
  comboEl.textContent = combo;
  goalEl.textContent = goalScore();
  levelEl.textContent = level;
}

function attachPointerHandlers(btn, r, c) {
  btn.addEventListener('pointerdown', (e) => {
    if (busy || movesLeft <= 0) return;
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    pointerStart = { x: e.clientX, y: e.clientY, r, c, pointerId: e.pointerId };
    activeTile = { r, c };
    btn.classList.add('selected');
  });

  btn.addEventListener('pointermove', (e) => {
    if (!pointerStart || busy) return;
    if (pointerStart.pointerId !== undefined && e.pointerId !== pointerStart.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    let target = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      target = { r: pointerStart.r, c: pointerStart.c + (dx > 0 ? 1 : -1) };
    } else {
      target = { r: pointerStart.r + (dy > 0 ? 1 : -1), c: pointerStart.c };
    }

    clearPointerState();
    if (target.r < 0 || target.r >= rows || target.c < 0 || target.c >= cols) return;
    makeMove({ r: r, c: c }, target);
  });

  const end = (e) => {
    if (pointerStart?.pointerId !== undefined && e?.pointerId !== undefined && e.pointerId !== pointerStart.pointerId) return;
    try { btn.releasePointerCapture?.(e.pointerId); } catch {}
    clearPointerState();
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('pointerleave', () => {
    if (!pointerStart) btn.classList.remove('selected');
  });
}

function clearPointerState() {
  pointerStart = null;
  activeTile = null;
  document.querySelectorAll('.tile.selected').forEach(el => el.classList.remove('selected'));
}

function getTileEl({ r, c }) {
  return boardEl.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
}

function cellDelta() {
  const first = boardEl.querySelector('.tile');
  if (!first) return { x: 0, y: 0 };
  const gap = parseFloat(getComputedStyle(boardEl).gap || '0');
  return { x: first.offsetWidth + gap, y: first.offsetHeight + gap };
}

function animateSwap(a, b, duration = 180) {
  const elA = getTileEl(a), elB = getTileEl(b);
  if (!elA || !elB) return Promise.resolve();
  const { x, y } = cellDelta();
  const dx = (b.c - a.c) * x, dy = (b.r - a.r) * y;
  const p1 = elA.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px, ${dy}px)` }], { duration, easing: 'ease-in-out', fill: 'forwards' }).finished;
  const p2 = elB.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-dx}px, ${-dy}px)` }], { duration, easing: 'ease-in-out', fill: 'forwards' }).finished;
  return Promise.all([p1, p2]).catch(() => {});
}

function animateDrops(drops) {
  const { y } = cellDelta();
  drops.forEach(({ row, col, distance }) => {
    const el = getTileEl({ r: row, c: col });
    if (!el || distance <= 0) return;
    el.animate([
      { transform: `translateY(${-distance * y}px) scale(.94)`, opacity: .35 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ], { duration: Math.min(520, 200 + distance * 65), easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

function markClearing(matches) {
  matches.forEach(([r, c]) => getTileEl({ r, c })?.classList.add('clearing'));
}

function burst(matches) {
  matches.forEach(([r,c]) => {
    const el = getTileEl({ r, c });
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const parent = boardEl.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.textContent = ['✨','💥','⭐'][i % 3];
      p.style.left = `${rect.left - parent.left + rect.width / 2 - 6}px`;
      p.style.top = `${rect.top - parent.top + rect.height / 2 - 6}px`;
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
      p.style.setProperty('--dy', `${(Math.random() - 0.5) * 80}px`);
      boardEl.appendChild(p);
      setTimeout(() => p.remove(), 560);
    }
  });
}

function findMatches() {
  const matched = new Set();
  for (let r = 0; r < rows; r++) {
    let count = 1;
    for (let c = 1; c <= cols; c++) {
      if (c < cols && board[r][c] === board[r][c - 1]) count++;
      else { if (count >= 3) for (let k = 0; k < count; k++) matched.add(`${r},${c - 1 - k}`); count = 1; }
    }
  }
  for (let c = 0; c < cols; c++) {
    let count = 1;
    for (let r = 1; r <= rows; r++) {
      if (r < rows && board[r][c] === board[r - 1][c]) count++;
      else { if (count >= 3) for (let k = 0; k < count; k++) matched.add(`${r - 1 - k},${c}`); count = 1; }
    }
  }
  return [...matched].map(x => x.split(',').map(Number));
}

function playSound(kind='swap') {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const map = { swap:[420,520,.08], clear:[800,420,.18], win:[520,880,.25] };
    const [from,to,dur] = map[kind] || map.swap;
    osc.type = 'triangle'; osc.frequency.setValueAtTime(from, now); osc.frequency.exponentialRampToValueAtTime(to, now + dur);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + dur);
  } catch {}
}

function refillMatched(matches, scoreIt = true) {
  const colsMap = new Map();
  matches.forEach(([r, c]) => { if (!colsMap.has(c)) colsMap.set(c, new Set()); colsMap.get(c).add(r); });
  const drops = [];
  for (const [c, rowSet] of colsMap.entries()) {
    const keep = [];
    for (let r = rows - 1; r >= 0; r--) if (!rowSet.has(r)) keep.push({ fruit: board[r][c], fromRow: r });
    let write = rows - 1;
    for (const item of keep) { board[write][c] = item.fruit; drops.push({ row: write, col: c, distance: write - item.fromRow }); write--; }
    let spawnIndex = 0;
    while (write >= 0) { board[write][c] = randFruit(); drops.push({ row: write, col: c, distance: write - (-1 - spawnIndex) }); spawnIndex++; write--; }
  }
  if (scoreIt) score += matches.length * 70 + Math.max(0, matches.length - 3) * 35 + combo * 30;
  return drops;
}

async function makeMove(a, b) {
  if (busy || movesLeft <= 0) return;
  busy = true;
  await animateSwap(a, b, 190);
  swap(a, b);
  playSound('swap');
  render();

  let matches = findMatches();
  if (matches.length === 0) {
    await sleep(70);
    await animateSwap(a, b, 190);
    swap(a, b);
    statusText.textContent = '这一步不能消除，已经自动换回。';
    busy = false;
    render();
    return;
  }

  movesLeft--;
  combo = 0;
  while (matches.length > 0) {
    combo++;
    statusText.textContent = `消除 ${matches.length} 个水果，连击 x${combo}！`;
    markClearing(matches);
    playSound('clear');
    burst(matches);
    await sleep(260);

    const drops = refillMatched(matches, true);
    render();
    await sleep(80);
    animateDrops(drops);
    await sleep(420);
    matches = findMatches();
  }

  if (score >= goalScore()) {
    playSound('win');
    level++;
    movesLeft = allowedMoves();
    statusText.textContent = `过关！进入第 ${level} 关，目标分数提升。`;
    initBoard();
    render();
  } else if (movesLeft <= 0) {
    statusText.textContent = `步数用完了，当前 ${score} 分。点“新开一局”再来一把。`;
    render();
  } else {
    statusText.textContent = `第 ${level} 关：当前 ${score} 分，还差 ${Math.max(0, goalScore() - score)} 分。`;
    render();
  }

  busy = false;
}

function newGame() {
  score = 0;
  combo = 0;
  level = 1;
  busy = false;
  movesLeft = allowedMoves();
  clearPointerState();
  initBoard();
  statusText.textContent = '新游戏开始，按住水果往相邻方向滑动即可交换 🍇';
  render();
}

newGameBtn.addEventListener('click', newGame);
newGame();
