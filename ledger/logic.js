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
    // 수입에는 type이 "income"이거나 이체 전환(toType) 규칙만 적용해 지출용 분류가 붙지 않게 한다
    const usable = (rules || []).filter((r) => t.type !== "income" || r.type === "income" || r.toType);
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
      const date = d ? normDate(`${d[1]}/${d[2]}`, defaultYear) : today;
      const lines = body.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      let memo = "";
      const tm = body.match(/\d{1,2}:\d{2}(?::\d{2})?\s+(.+)/);
      if (tm) memo = tm[1].split(/\r?\n/)[0].trim();
      if (!memo) {
        memo = [...lines].reverse().find((l) => !/누적|잔액|한도|승인|입금|출금|원/.test(l)) || "";
      }
      memo = memo.replace(/(누적|잔액).*$/, "").trim();
      return { date: date || today, type, amount: a, memo, raw: body };
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

  const api = { parseAmount, normDate, parseCSV, detectColumns, findHeaderRow, categorize, applyRules, dedupeKey, rowsToTx, parseSms, splitSms, computeHoldings, summarize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== "undefined" ? window : globalThis);
