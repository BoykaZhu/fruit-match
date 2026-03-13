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
let board = [];
let selected = null;
let score = 0;
let movesLeft = baseMoves;
let combo = 0;
let level = 1;
let busy = false;
let audioCtx = null;

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
      if (selected && selected.r === r && selected.c === c) btn.classList.add('selected');
      btn.textContent = board[r][c];
      btn.addEventListener('click', () => onTileClick(r, c));
      boardEl.appendChild(btn);
    }
  }
  scoreEl.textContent = score;
  movesEl.textContent = movesLeft;
  comboEl.textContent = combo;
  goalEl.textContent = goalScore();
  levelEl.textContent = level;
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

function animateSwap(a, b) {
  const elA = getTileEl(a), elB = getTileEl(b);
  if (!elA || !elB) return Promise.resolve();
  const { x, y } = cellDelta();
  const dx = (b.c - a.c) * x, dy = (b.r - a.r) * y;
  const p1 = elA.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px, ${dy}px)` }], { duration: 180, easing: 'ease-in-out', fill: 'forwards' }).finished;
  const p2 = elB.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-dx}px, ${-dy}px)` }], { duration: 180, easing: 'ease-in-out', fill: 'forwards' }).finished;
  return Promise.all([p1, p2]).catch(() => {});
}

function animateDrops(drops) {
  const { y } = cellDelta();
  drops.forEach(({ row, col, distance }) => {
    const el = getTileEl({ r: row, c: col });
    if (!el || distance <= 0) return;
    el.animate([
      { transform: `translateY(${-distance * y}px) scale(.92)`, opacity: .45 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ], { duration: Math.min(450, 150 + distance * 60), easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

function burst(matches) {
  matches.forEach(([r,c]) => {
    const el = getTileEl({ r, c });
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const parent = boardEl.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.textContent = ['✨','💥','⭐'][i % 3];
      p.style.left = `${rect.left - parent.left + rect.width / 2 - 6}px`;
      p.style.top = `${rect.top - parent.top + rect.height / 2 - 6}px`;
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`);
      p.style.setProperty('--dy', `${(Math.random() - 0.5) * 70}px`);
      boardEl.appendChild(p);
      setTimeout(() => p.remove(), 520);
    }
  });
}

function onTileClick(r, c) {
  if (busy || movesLeft <= 0) return;
  if (!selected) return selected = { r, c }, void render();
  if (selected.r === r && selected.c === c) return selected = null, void render();
  if (!isAdjacent(selected, { r, c })) return selected = { r, c }, void render();
  makeMove(selected, { r, c });
}

function isAdjacent(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; }
function swap(a, b) { [board[a.r][a.c], board[b.r][b.c]] = [board[b.r][b.c], board[a.r][a.c]]; }

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
  busy = true;
  await animateSwap(a, b);
  swap(a, b); playSound('swap'); selected = null; render();
  let matches = findMatches();
  if (matches.length === 0) {
    await sleep(60); await animateSwap(a, b); swap(a, b);
    statusText.textContent = '这一步不能消除，已经自动换回。'; busy = false; render(); return;
  }
  movesLeft--; combo = 0;
  while (matches.length > 0) {
    combo++; playSound('clear'); burst(matches);
    statusText.textContent = `消除 ${matches.length} 个水果，连击 x${combo}！`;
    const drops = refillMatched(matches, true);
    render(); animateDrops(drops); await sleep(340); matches = findMatches();
  }
  if (score >= goalScore()) {
    playSound('win');
    level++;
    movesLeft = allowedMoves();
    statusText.textContent = `过关！进入第 ${level} 关，目标分数提升。`;
    initBoard(); render();
  } else if (movesLeft <= 0) {
    statusText.textContent = `步数用完了，当前 ${score} 分。点“新开一局”再来一把。`;
  } else {
    statusText.textContent = `第 ${level} 关：当前 ${score} 分，还差 ${Math.max(0, goalScore() - score)} 分。`;
  }
  busy = false; render();
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function newGame() {
  score = 0; combo = 0; level = 1; selected = null; busy = false; movesLeft = allowedMoves(); initBoard();
  statusText.textContent = '新游戏开始，试试做个大连击吧 🍇'; render();
}
newGameBtn.addEventListener('click', newGame);
newGame();
