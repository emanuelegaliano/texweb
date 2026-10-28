import path from 'node:path';

// collects errors and warnings with file and line, shown in the terminal and on the page
export class Diagnostics {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.seen = new Set();
  }

  add(level, file, line, message) {
    const rel = file ? path.relative(this.root, file) : '';
    const key = `${level}|${rel}|${line}|${message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.items.push({ level, file: rel, line, message });
  }

  error(file, line, message) { this.add('error', file, line, message); }
  warn(file, line, message) { this.add('warning', file, line, message); }

  get errors() { return this.items.filter((d) => d.level === 'error'); }

  format() {
    return this.items.map((d) => {
      const where = d.file ? `${d.file}${d.line ? `:${d.line}` : ''}  ` : '';
      const tag = d.level === 'error' ? '\x1b[31merror\x1b[0m' : '\x1b[33mwarning\x1b[0m';
      return `${tag}  ${where}${d.message}`;
    }).join('\n');
  }
}

// Levenshtein distance, for the "did you mean" suggestions
export function closest(name, candidates) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = lev(name, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, name.length / 3) ? best : null;
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}
