const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');
const comboEl = document.getElementById('combo');
const goalEl = document.getElementById('goal');
const statusText = document.getElementById('statusText');
const newGameBtn = document.getElementById('newGameBtn');

const fruits = ['🍎', '🍊', '🍇', '🍓', '🍍', '🥝'];
const size = 8;
const goalScore = 2500;
const maxMoves = 20;
let board = [];
let selected = null;
let score = 0;
let movesLeft = maxMoves;
let combo = 0;
let busy = false;
let audioCtx = null;

function randFruit() {
  return fruits[Math.floor(Math.random() * fruits.length)];
}

function initBoard() {
  board = Array.from({ length: size }, () => Array.from({ length: size }, () => randFruit()));
  while (findMatches().length > 0) refillMatched(findMatches(), false);
}

function render() {
  boardEl.innerHTML = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const btn = document.createElement('button');
      btn.className = 'tile';
      btn.type = 'button';
      if (selected && selected.r === r && selected.c === c) btn.classList.add('selected');
      btn.textContent = board[r][c];
      btn.addEventListener('click', () => onTileClick(r, c));
      boardEl.appendChild(btn);
    }
  }
  scoreEl.textContent = score;
  movesEl.textContent = movesLeft;
  comboEl.textContent = combo;
  goalEl.textContent = goalScore;
}

function onTileClick(r, c) {
  if (busy || movesLeft <= 0) return;
  if (!selected) {
    selected = { r, c };
    render();
    return;
  }
  if (selected.r === r && selected.c === c) {
    selected = null;
    render();
    return;
  }
  if (!isAdjacent(selected, { r, c })) {
    selected = { r, c };
    render();
    return;
  }
  makeMove(selected, { r, c });
}

function isAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

function swap(a, b) {
  [board[a.r][a.c], board[b.r][b.c]] = [board[b.r][b.c], board[a.r][a.c]];
}

function findMatches() {
  const matched = new Set();
  for (let r = 0; r < size; r++) {
    let count = 1;
    for (let c = 1; c <= size; c++) {
      if (c < size && board[r][c] === board[r][c - 1]) count++;
      else {
        if (count >= 3) for (let k = 0; k < count; k++) matched.add(`${r},${c - 1 - k}`);
        count = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let count = 1;
    for (let r = 1; r <= size; r++) {
      if (r < size && board[r][c] === board[r - 1][c]) count++;
      else {
        if (count >= 3) for (let k = 0; k < count; k++) matched.add(`${r - 1 - k},${c}`);
        count = 1;
      }
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
    const map = { swap:[420,520,.08], clear:[700,420,.16], win:[520,780,.22] };
    const [from,to,dur] = map[kind] || map.swap;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + dur);
  } catch {}
}

function refillMatched(matches, scoreIt=true) {
  const cols = new Map();
  matches.forEach(([r, c]) => {
    if (!cols.has(c)) cols.set(c, []);
    cols.get(c).push(r);
  });

  for (const [c, rows] of cols.entries()) {
    const keep = [];
    for (let r = size - 1; r >= 0; r--) {
      if (!rows.includes(r)) keep.push(board[r][c]);
    }
    for (let r = size - 1; r >= 0; r--) {
      board[r][c] = keep[size - 1 - r] ?? randFruit();
    }
  }

  if (scoreIt) {
    score += matches.length * 60 + Math.max(0, matches.length - 3) * 25 + combo * 20;
  }
}

async function makeMove(a, b) {
  busy = true;
  swap(a, b);
  playSound('swap');
  selected = null;
  render();

  let matches = findMatches();
  if (matches.length === 0) {
    await sleep(180);
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
    playSound('clear');
    statusText.textContent = `消除 ${matches.length} 个水果，连击 x${combo}！`;
    refillMatched(matches, true);
    render();
    await sleep(220);
    matches = findMatches();
  }

  if (score >= goalScore) {
    playSound('win');
    statusText.textContent = `过关啦！你已达到 ${score} 分 🎉`;
  } else if (movesLeft <= 0) {
    statusText.textContent = score >= goalScore ? '挑战成功！' : `步数用完了，当前 ${score} 分，再来一局？`;
  } else {
    statusText.textContent = `当前 ${score} 分，还差 ${Math.max(0, goalScore - score)} 分过关。`;
  }

  busy = false;
  render();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function newGame() {
  score = 0;
  movesLeft = maxMoves;
  combo = 0;
  selected = null;
  busy = false;
  initBoard();
  statusText.textContent = '新游戏开始，试试做个大连击吧 🍇';
  render();
}

newGameBtn.addEventListener('click', newGame);
newGame();
