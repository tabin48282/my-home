// 가계부 순수 로직 (DOM 없음). 브라우저에서는 window.Logic, Node에서는 module.exports로 사용.
(function (root) {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");

  function parseAmount(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    let s = String(v).trim();
    if (!s) return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/^-/.test(s)) { neg = true; s = s.slice(1); }
    s = s.replace(/[,\s원₩KRW]/g, "");
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    const n = Number(s);
    return neg ? -n : n;
  }

  // 2026-04-25 / 2026.04.25 / 2026/04/25 / 20260425 / 26.04.25 / 04/25 / 4월 25일, 시간 부분은 무시
  function normDate(v, defaultYear) {
    if (v == null) return null;
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-./\s]*(\d{1,2})[-./\s]*(\d{1,2})/);
    if (m && valid(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/);
    if (m && valid(2000 + +m[1], +m[2], +m[3])) return `${2000 + +m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?!\d)/) || s.match(/^(\d{1,2})월\s*(\d{1,2})일/);
    if (m && defaultYear && valid(defaultYear, +m[1], +m[2])) return `${defaultYear}-${pad(m[1])}-${pad(m[2])}`;
    return null;
  }
  function valid(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, mo - 1, d);
    return dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  // 따옴표/BOM/쉼표·탭 구분을 처리하는 CSV 파서
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/, 1)[0] || "";
    const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        rows.push(row); row = [];
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  }

  // 헤더 이름으로 열 자동 추정
  function detectColumns(headers) {
    const h = headers.map((x) => String(x == null ? "" : x).replace(/\s/g, ""));
    const find = (re, skip) => h.findIndex((x, i) => re.test(x) && !(skip && skip.includes(i)));
    const out = find(/출금|지급|찾으신/);
    const inn = find(/입금|맡기신/);
    const date = find(/이용일|거래일|승인일|결제일|일자|일시|날짜/);
    const memo = find(/가맹점|이용처|적요|거래내용|내용|거래처|기재|메모|상호/);
    let amount = find(/이용금액|승인금액|결제금액|거래금액|^금액/);
    if (amount === -1) amount = find(/금액/, [out, inn]);
    return { date, memo, amount, out, in: inn };
  }

  // 제목 줄 등이 앞에 있어도 실제 헤더 행을 찾는다
  function findHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const c = detectColumns(rows[i]);
      if (c.date !== -1 && (c.amount !== -1 || c.out !== -1 || c.in !== -1)) return i;
    }
    return -1;
  }

  function categorize(memo, type, rules) {
    const m = String(memo || "");
    for (const r of rules || []) {
      if (r.type && r.type !== type) continue;
      if (r.kw && m.toLowerCase().includes(r.kw.toLowerCase())) return r;
    }
    return null;
  }

  // 카드대금처럼 계좌 간 이동이라 지출로 세면 안 되는 거래를 이체로 분류하는 기본 규칙에 사용
  function applyRules(t, rules) {
    // 수입에는 type이 "income"이거나 이체 전환 규칙만 적용해 지출·저축용 분류가 붙지 않게 한다
    // (예: '적금 만기' 입금이 '적금 → 저축' 규칙에 걸려 저축으로 바뀌지 않도록)
    const usable = (rules || []).filter((r) => t.type !== "income" || r.type === "income" || r.toType === "transfer");
    const r = categorize(t.memo, t.type, usable);
    if (r) {
      if (r.toType) t.type = r.toType;
      t.category = r.category || t.category;
    }
    return t;
  }

  function dedupeKey(t) {
    return [t.date, t.accountId, Math.round(Math.abs(t.amount) * 100), String(t.memo || "").replace(/\s/g, "")].join("|");
  }

  // 같은 날 같은 가맹점에서 같은 금액을 두 번 쓴 경우도 있으므로 "횟수"로 비교한다.
  // 기존에 같은 키가 n건 있으면, 새 목록에서 같은 키의 n+1번째부터만 새 거래로 본다.
  function filterNew(existing, incoming) {
    const have = new Map();
    for (const t of existing) { const k = dedupeKey(t); have.set(k, (have.get(k) || 0) + 1); }
    const seen = new Map(), fresh = [];
    for (const t of incoming) {
      const k = dedupeKey(t);
      const n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      if (n > (have.get(k) || 0)) fresh.push(t);
    }
    return fresh;
  }

  // 1순위: 카드번호 끝 4자리, 2순위: 계정 이름이 가장 길게 일치하는 것, 3순위: 카드사·은행 이름 앞 2글자
  function guessAccount(text, accounts) {
    const t = String(text || "").replace(/\s/g, "");
    const digits = new Set((t.match(/\d{4}(?!\d)/g) || []));
    const byLast4 = accounts.filter((a) => a.last4 && digits.has(a.last4));
    if (byLast4.length === 1) return byLast4[0].id;
    const pool = byLast4.length ? byLast4 : accounts;
    let best = null, bestLen = 0;
    for (const a of pool) {
      const name = a.name.replace(/\s/g, "");
      if (name && t.includes(name) && name.length > bestLen) { best = a; bestLen = name.length; }
    }
    if (best) return best.id;
    const pre = pool.find((a) => a.name.replace(/\s/g, "").length >= 2 && t.includes(a.name.replace(/\s/g, "").slice(0, 2)));
    return pre ? pre.id : null;
  }

  function monthlyTrend(tx, ym, n) {
    let [y, m] = ym.split("-").map(Number);
    const out = [];
    for (let i = 0; i < n; i++) {
      const key = `${y}-${pad(m)}`;
      out.unshift({ ym: key, ...summarize(tx, key) });
      m--; if (m < 1) { m = 12; y--; }
    }
    return out;
  }

  // mapping: {date, memo, amount, out, in} (열 인덱스, 없으면 -1)
  // signMode: 'expense' 금액 열의 양수=지출(음수=취소/환불), 'signed' 음수=지출·양수=수입
  function rowsToTx(rows, mapping, opts) {
    const { accountId, rules, signMode, defaultYear } = opts;
    const res = [], skipped = [];
    for (const r of rows) {
      const date = normDate(r[mapping.date], defaultYear);
      const memo = mapping.memo >= 0 ? String(r[mapping.memo] || "").trim() : "";
      let type, amount;
      const o = mapping.out >= 0 ? parseAmount(r[mapping.out]) : NaN;
      const i = mapping.in >= 0 ? parseAmount(r[mapping.in]) : NaN;
      if (o > 0) { type = "expense"; amount = o; }
      else if (i > 0) { type = "income"; amount = i; }
      else if (mapping.amount >= 0) {
        const a = parseAmount(r[mapping.amount]);
        if (!isFinite(a) || a === 0) { skipped.push(r); continue; }
        if (signMode === "signed") { type = a < 0 ? "expense" : "income"; amount = Math.abs(a); }
        else { type = "expense"; amount = a; } // 음수는 환불로 남긴다
      } else { skipped.push(r); continue; }
      if (!date || !isFinite(amount)) { skipped.push(r); continue; }
      const t = { date, type, amount, accountId, category: type === "income" ? "기타수입" : "기타", memo };
      res.push(applyRules(t, rules));
    }
    return { tx: res, skipped };
  }

  // 카드 승인 / 입출금 문자 한 건 해석 (형식이 카드사마다 달라 최선 추정 후 사용자가 수정)
  function parseSms(text, defaultYear, today) {
    const body = String(text).replace(/\[Web발신\]|\[국외발신\]/g, "").trim();
    const am = body.match(/(-?[\d,]+)\s*원/);
    if (!am) return null;
    const amount = parseAmount(am[1]);
    if (!isFinite(amount) || amount === 0) return null;
    const cancel = /취소/.test(body);
    let type = /입금/.test(body) ? "income" : "expense";
    if (cancel && type === "expense") return mk(-Math.abs(amount)); // 승인취소 → 환불(음수 지출)
    return mk(Math.abs(amount));

    function mk(a) {
      const d = body.match(/(\d{1,2})\/(\d{1,2})/) || body.match(/(\d{1,2})월\s*(\d{1,2})일/);
      let date = d ? normDate(`${d[1]}/${d[2]}`, defaultYear) : today;
      // 12/31 문자를 1월에 붙여 넣는 경우처럼 오늘보다 미래면 전년도로 본다
      if (date && today && date > today) date = normDate(`${d[1]}/${d[2]}`, defaultYear - 1);
      const lines = body.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      let memo = "";
      const tm = body.match(/\d{1,2}:\d{2}(?::\d{2})?\s+(.+)/);
      if (tm) memo = tm[1].split(/\r?\n/)[0].trim();
      if (!memo) {
        memo = [...lines].reverse().find((l) => !/누적|잔액|한도|승인|입금|출금|원/.test(l)) || "";
      }
      memo = memo.replace(/(누적|잔액).*$/, "").trim();
      const card = body.match(/[(*](\d{4})\)?/);
      return { date: date || today, type, amount: a, memo, last4: card ? card[1] : null, raw: body };
    }
  }

  function splitSms(text) {
    const t = String(text).trim();
    const parts = t.split(/(?=\[Web발신\]|\[국외발신\])/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
    return t.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  }

  // 주식: 평균단가법. side = buy | sell | dividend
  function computeHoldings(trades, prices) {
    const map = new Map();
    const sorted = [...trades].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const t of sorted) {
      const key = t.symbol;
      if (!map.has(key)) map.set(key, { symbol: key, name: t.name || key, qty: 0, cost: 0, realized: 0, dividend: 0 });
      const h = map.get(key);
      if (t.name) h.name = t.name;
      const fee = Number(t.fee) || 0;
      if (t.side === "buy") {
        h.qty += t.qty;
        h.cost += t.qty * t.price + fee;
      } else if (t.side === "sell") {
        const q = Math.min(t.qty, h.qty);
        const avg = h.qty > 0 ? h.cost / h.qty : 0;
        h.realized += q * t.price - fee - q * avg;
        h.cost -= q * avg;
        h.qty -= q;
        if (h.qty < 1e-9) { h.qty = 0; h.cost = 0; }
      } else if (t.side === "dividend") {
        h.dividend += t.price - fee;
      }
    }
    const list = [];
    let totalCost = 0, totalValue = 0, totalRealized = 0, totalDividend = 0;
    for (const h of map.values()) {
      const price = prices && isFinite(prices[h.symbol]) && prices[h.symbol] > 0 ? prices[h.symbol] : null;
      const avg = h.qty > 0 ? h.cost / h.qty : 0;
      const value = price != null ? h.qty * price : null;
      const unrealized = value != null ? value - h.cost : null;
      list.push({ ...h, avg, price, value, unrealized, rate: unrealized != null && h.cost > 0 ? unrealized / h.cost : null });
      totalRealized += h.realized;
      totalDividend += h.dividend;
      if (h.qty > 0) { totalCost += h.cost; totalValue += value != null ? value : h.cost; }
    }
    return { list, totalCost, totalValue, totalUnrealized: totalValue - totalCost, totalRealized, totalDividend };
  }

  function inMonth(date, ym) { return date.slice(0, 7) === ym; }

  function summarize(tx, ym) {
    let income = 0, expense = 0;
    const byCat = {}, byAcc = {};
    for (const t of tx) {
      if (!inMonth(t.date, ym)) continue;
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") {
        expense += t.amount;
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
        byAcc[t.accountId] = (byAcc[t.accountId] || 0) + t.amount;
      }
    }
    return { income, expense, byCat, byAcc };
  }

  // ---------- 월 결산 ----------
  // meta: { expense: {분류: {group: 'fixed'|'variable'}}, saving: {분류: {group: 'save'|'invest'|'repay'}} }
  function settle(tx, ym, meta) {
    const em = (meta && meta.expense) || {}, sm = (meta && meta.saving) || {};
    const r = { income: 0, fixed: 0, variable: 0, save: 0, invest: 0, repay: 0, transfer: 0, byCat: {}, byIncome: {}, bySaving: {}, byAcc: {} };
    for (const t of tx) {
      if (!inMonth(t.date, ym)) continue;
      if (t.type === "income") { r.income += t.amount; r.byIncome[t.category] = (r.byIncome[t.category] || 0) + t.amount; }
      else if (t.type === "expense") {
        if ((em[t.category] || {}).group === "fixed") r.fixed += t.amount; else r.variable += t.amount;
        r.byCat[t.category] = (r.byCat[t.category] || 0) + t.amount;
        r.byAcc[t.accountId] = (r.byAcc[t.accountId] || 0) + t.amount;
      } else if (t.type === "saving") {
        const g = (sm[t.category] || {}).group;
        r[g === "invest" || g === "repay" ? g : "save"] += t.amount;
        r.bySaving[t.category] = (r.bySaving[t.category] || 0) + t.amount;
      } else if (t.type === "transfer") r.transfer += t.amount;
    }
    r.consume = r.fixed + r.variable;
    r.saveAll = r.save + r.invest + r.repay;
    r.left = r.income - r.consume - r.saveAll; // 잔여자금 = 총수입 - 실제 현금 유출(소비 + 저축·투자·추가상환)
    r.consumeRate = r.income > 0 ? r.consume / r.income : null;
    r.saveRate = r.income > 0 ? r.saveAll / r.income : null;
    return r;
  }

  function prevYm(ym, k) {
    let [y, m] = ym.split("-").map(Number);
    m -= k == null ? 1 : k;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return `${y}-${pad(m)}`;
  }
  const monthsBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

  // 분류별 이번 달 vs 지난달 (환불로 음수인 경우도 그대로 비교)
  function compareMonths(tx, ym, type) {
    const cur = {}, prev = {}, pym = prevYm(ym);
    for (const t of tx) {
      if (t.type !== (type || "expense")) continue;
      const k = t.date.slice(0, 7);
      if (k === ym) cur[t.category] = (cur[t.category] || 0) + t.amount;
      else if (k === pym) prev[t.category] = (prev[t.category] || 0) + t.amount;
    }
    return [...new Set([...Object.keys(cur), ...Object.keys(prev)])].map((c) => {
      const a = cur[c] || 0, b = prev[c] || 0;
      return { cat: c, cur: a, prev: b, diff: a - b, rate: b > 0 ? (a - b) / b : null };
    }).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  }

  // ---------- 저축 목표 ----------
  // goal: {year, target, cats: []} cats가 비어 있으면 저축·투자 전체
  function goalProgress(tx, goal, today) {
    const y = String(goal.year);
    const cats = goal.cats && goal.cats.length ? new Set(goal.cats) : null;
    let done = 0;
    for (const t of tx) if (t.type === "saving" && t.date.slice(0, 4) === y && (!cats || cats.has(t.category))) done += t.amount;
    const target = Number(goal.target) || 0;
    const remain = Math.max(0, target - done);
    const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
    // 남은 달 수: 올해 목표면 이번 달 포함, 미래 연도면 12개월, 지난 연도면 0
    const monthsLeft = Number(y) > ty ? 12 : Number(y) === ty ? 13 - tm : 0;
    return { done, target, remain, rate: target > 0 ? done / target : null, monthsLeft, perMonth: monthsLeft > 0 ? remain / monthsLeft : null };
  }

  // ---------- 대출 ----------
  // 원리금균등 월 상환액
  function annuityPayment(balance, annualRate, months) {
    if (!(months > 0)) return 0;
    const r = annualRate / 100 / 12;
    if (r === 0) return balance / months;
    return (balance * r) / (1 - Math.pow(1 + r, -months));
  }

  // 상환 기록을 날짜순으로 이어서 전월 잔액·월말 잔액을 계산한다
  function loanLedger(loan, recs) {
    let bal = Number(loan.balance0) || 0;
    const rows = recs.filter((r) => r.loanId === loan.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((r) => {
      const prev = bal;
      bal = Math.max(0, prev - (Number(r.principal) || 0) - (Number(r.extra) || 0));
      return { ...r, prev, end: bal };
    });
    return { rows, balance: bal };
  }
  // ym 월말 기준 잔액 (순자산 자동 채우기용)
  function loanBalanceAt(loan, recs, ym) {
    const { rows } = loanLedger(loan, recs);
    let bal = Number(loan.balance0) || 0;
    for (const r of rows) if (r.date.slice(0, 7) <= ym) bal = r.end;
    return bal;
  }

  // method: 'annuity'(원리금균등, 월 상환액 고정) | 'equal'(원금균등, 월 원금 고정) | 'bullet'(만기일시, 이자만 납부)
  // 추가 상환액은 매달 정기 상환과 별도로 원금에 바로 넣는다고 가정한다.
  function simulateLoan(o) {
    const r = (Number(o.rate) || 0) / 100 / 12;
    let bal = Number(o.balance) || 0;
    const months = Math.max(1, Math.round(Number(o.months) || 1));
    const extra = Math.max(0, Number(o.extra) || 0);
    const pay = Number(o.payment) > 0 ? Number(o.payment) : annuityPayment(bal, o.rate, months);
    const part = bal / months;
    let n = 0, interest = 0;
    while (bal > 0.5 && n < 1200) {
      n++;
      const it = bal * r;
      let p;
      if (o.method === "equal") p = part;
      else if (o.method === "bullet") p = n >= months ? bal : 0;
      else p = pay - it;
      p = Math.min(bal, Math.max(0, p) + extra);
      if (p <= 0 && o.method !== "bullet") return { months: null, interest: null, payment: pay }; // 이자도 못 갚는 상환액
      interest += it;
      bal -= p;
    }
    if (bal > 0.5) return { months: null, interest: null, payment: pay };
    return { months: n, interest, payment: pay };
  }

  // 목표 개월 수 안에 끝내려면 매달 얼마를 추가로 갚아야 하는지 (이분 탐색, 1원 단위)
  function requiredExtra(o, targetMonths) {
    if (!(targetMonths > 0)) return null;
    const base = simulateLoan({ ...o, extra: 0 });
    if (base.months != null && base.months <= targetMonths) return 0;
    let lo = 0, hi = Number(o.balance) || 0;
    for (let i = 0; i < 60 && hi - lo > 1; i++) {
      const mid = (lo + hi) / 2;
      const s = simulateLoan({ ...o, extra: mid });
      if (s.months != null && s.months <= targetMonths) hi = mid; else lo = mid;
    }
    return Math.ceil(hi);
  }

  // ---------- 순자산 ----------
  // items: [{id, side:'asset'|'debt'}], values: {id: 금액}
  function netWorth(items, values) {
    let asset = 0, debt = 0;
    for (const it of items) {
      const v = Number((values || {})[it.id]) || 0;
      if (it.side === "debt") debt += v; else asset += v;
    }
    return { asset, debt, net: asset - debt };
  }

  const api = { settle, prevYm, monthsBetween, compareMonths, goalProgress, annuityPayment, loanLedger, loanBalanceAt, simulateLoan, requiredExtra, netWorth, parseAmount, normDate, parseCSV, detectColumns, findHeaderRow, categorize, applyRules, dedupeKey, rowsToTx, parseSms, splitSms, computeHoldings, summarize, filterNew, guessAccount, monthlyTrend };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== "undefined" ? window : globalThis);
