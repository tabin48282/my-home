(function () {
  "use strict";
  const L = window.Logic;
  const KEY = "ledger.v1";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const won = (n) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("ko-KR") + "원";
  const pct = (r) => (r == null ? "-" : (r >= 0 ? "+" : "") + (r * 100).toFixed(2) + "%");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);

  const KIND = { card: "신용카드", check: "체크카드", prepaid: "선불·지역화폐", bank: "은행", broker: "증권", cash: "현금" };
  const TYPE_LABEL = { expense: "지출", income: "수입", saving: "저축·투자", transfer: "이체" };
  const GROUPS = { expense: { fixed: "고정지출", variable: "변동지출" }, saving: { save: "저축", invest: "투자", repay: "대출 추가 상환" } };
  const LOAN_METHOD = { annuity: "원리금균등", equal: "원금균등", bullet: "만기일시" };

  // 사진의 가계부 구조를 기본 분류로 쓴다. [이름, 그룹]
  const DEF_EXPENSE = [
    ["주거비", "fixed"], ["대출", "fixed"], ["통신비", "fixed"], ["인터넷·TV", "fixed"], ["보험료", "fixed"], ["차량 유지비", "fixed"],
    ["구독료", "fixed"], ["정기결제", "fixed"], ["기타 고정비", "fixed"],
    ["식비", "variable"], ["외식비", "variable"], ["간식·음료", "variable"], ["주류", "variable"], ["생활용품", "variable"], ["교통비", "variable"],
    ["자동차", "variable"], ["의료비", "variable"], ["의류·미용", "variable"], ["취미·여가", "variable"], ["경조사비", "variable"], ["쇼핑", "variable"], ["기타", "variable"],
  ];
  const DEF_INCOME = ["급여", "배우자 급여", "상여금", "부업 수입", "금융 수입", "기타수입"];
  const DEF_SAVING = [["예금·적금", "save"], ["비상금", "save"], ["주식 투자금", "invest"], ["연금저축", "save"], ["IRP", "save"], ["기타 투자", "invest"], ["주택대출 추가 상환", "repay"], ["기타 저축", "save"]];
  // 예전 기본 분류(버전 2)를 쓰던 사용자의 고정지출 표시용
  const OLD_FIXED = ["주거·통신", "보험", "교육"];
  const DEF_NW = [
    ["cash", "현금성 자산", "asset", "현금, 입출금통장"], ["deposit", "예금·적금", "asset", "은행 예금 및 적금 잔액"], ["stock", "주식 자산", "asset", "주식계좌 평가금액"],
    ["pension", "연금 자산", "asset", "연금저축, IRP 잔액"], ["etc-asset", "기타 자산", "asset", "기타 금융자산"], ["realty", "부동산 자산", "asset", "주택 등 부동산 평가액"],
    ["etc-debt", "기타 부채", "debt", "신용대출 등"], ["mortgage", "주택담보대출", "debt", "남은 주택담보대출"],
  ];

  const SAVING_RULES = [
    { kw: "증권", toType: "saving", category: "주식 투자금" },
    { kw: "적금", toType: "saving", category: "예금·적금" },
    { kw: "연금저축", toType: "saving", category: "연금저축" },
    { kw: "IRP", toType: "saving", category: "IRP" },
  ];
  const DEFAULT_STATE = () => ({
    version: 3,
    accounts: [
      { id: "shinhan", name: "신한카드", kind: "card", last4: "" },
      { id: "kdb-check", name: "산업은행 체크카드", kind: "check", last4: "" },
      { id: "ulsan-pay", name: "울산페이카드", kind: "prepaid", last4: "" },
      { id: "cash", name: "현금", kind: "cash", last4: "" },
      { id: "broker", name: "증권계좌", kind: "broker", last4: "" },
    ],
    categories: {
      expense: DEF_EXPENSE.map((x) => x[0]),
      income: [...DEF_INCOME],
      saving: DEF_SAVING.map((x) => x[0]),
      transfer: ["이체", "카드대금", "투자이체"],
    },
    // 분류별 그룹(고정·변동 / 저축·투자·상환)과 월 예산
    catMeta: {
      expense: Object.fromEntries(DEF_EXPENSE.map(([n, g]) => [n, { group: g }])),
      saving: Object.fromEntries(DEF_SAVING.map(([n, g]) => [n, { group: g }])),
    },
    rules: [
      { kw: "카드대금", toType: "transfer", category: "카드대금" },
      { kw: "카드결제", toType: "transfer", category: "카드대금" },
      { kw: "증권", toType: "transfer", category: "투자이체", type: "income" }, // 증권계좌에서 받은 돈은 수입이 아님
      ...SAVING_RULES,
      { kw: "스타벅스", category: "간식·음료" }, { kw: "커피", category: "간식·음료" }, { kw: "카페", category: "간식·음료" },
      { kw: "이디야", category: "간식·음료" }, { kw: "메가MGC", category: "간식·음료" }, { kw: "투썸", category: "간식·음료" },
      { kw: "GS25", category: "간식·음료" }, { kw: "세븐일레븐", category: "간식·음료" }, { kw: "CU", category: "간식·음료" },
      { kw: "이마트", category: "식비" }, { kw: "홈플러스", category: "식비" }, { kw: "롯데마트", category: "식비" },
      { kw: "배달의민족", category: "외식비" }, { kw: "요기요", category: "외식비" }, { kw: "쿠팡이츠", category: "외식비" },
      { kw: "택시", category: "교통비" }, { kw: "버스", category: "교통비" }, { kw: "지하철", category: "교통비" }, { kw: "코레일", category: "교통비" },
      { kw: "티머니", category: "교통비" }, { kw: "주유", category: "자동차" }, { kw: "세차", category: "자동차" }, { kw: "주차", category: "차량 유지비" },
      { kw: "쿠팡", category: "쇼핑" }, { kw: "11번가", category: "쇼핑" }, { kw: "G마켓", category: "쇼핑" },
      { kw: "병원", category: "의료비" }, { kw: "약국", category: "의료비" }, { kw: "의원", category: "의료비" },
      { kw: "SKT", category: "통신비" }, { kw: "통신", category: "통신비" }, { kw: "관리비", category: "주거비" }, { kw: "보험", category: "보험료" },
      { kw: "넷플릭스", category: "구독료" }, { kw: "유튜브", category: "구독료" },
      { kw: "급여", category: "급여", type: "income" }, { kw: "월급", category: "급여", type: "income" }, { kw: "상여", category: "상여금", type: "income" },
      { kw: "이자", category: "금융 수입", type: "income" }, { kw: "배당", category: "금융 수입", type: "income" }, { kw: "환급", category: "기타수입", type: "income" },
    ],
    tx: [],
    trades: [],
    prices: {},
    batches: [], // 가져오기 기록 [{id, at, label, count}]
    loans: [],    // [{id, name, kind, amount0(최초 대출금), balance0(등록 시 잔액), rate, method, months(등록 시 남은 개월), payment, target, nwItem}]
    loanRecs: [], // [{id, loanId, date, principal, interest, extra, accountId, sync}]
    nw: { items: DEF_NW.map(([id, name, side, hint]) => ({ id, name, side, hint, ...(id === "stock" ? { auto: "invest" } : {}) })), months: {} }, // months: {"2026-10": {itemId: 금액}}
    goals: [],    // [{id, name, year, target, cats: []}]
    settings: { budget: 0, lastBackup: null },
  });

  let state = DEFAULT_STATE();
  let storageOk = true;
  const ui = { tab: "home", asub: "nw", ym: todayStr().slice(0, 7), fAcc: "", fType: "", fCat: "", q: "", cmpAll: false };

  function normalize(s) {
    const d = DEFAULT_STATE();
    const n = Object.assign(d, s);
    n.categories = Object.assign(DEFAULT_STATE().categories, s.categories || {});
    n.settings = Object.assign(DEFAULT_STATE().settings, s.settings || {});
    n.batches = Array.isArray(s.batches) ? s.batches : [];
    n.accounts = n.accounts.map((a) => ({ last4: "", ...a }));
    const dm = DEFAULT_STATE().catMeta;
    n.catMeta = { expense: { ...dm.expense, ...((s.catMeta || {}).expense || {}) }, saving: { ...dm.saving, ...((s.catMeta || {}).saving || {}) } };
    for (const k of ["loans", "loanRecs", "goals"]) n[k] = Array.isArray(s[k]) ? s[k] : [];
    n.nw = s.nw && Array.isArray(s.nw.items) ? { items: s.nw.items, months: s.nw.months || {} } : DEFAULT_STATE().nw;
    if ((s.version || 1) < 3) {
      // 버전 2 → 3: 내역이 하나도 없으면 새 기본 분류·규칙으로 바꾸고, 있으면 기존 분류는 그대로 두고 새 분류만 덧붙인다
      if (!(s.tx || []).length && !(s.trades || []).length) {
        n.categories = DEFAULT_STATE().categories;
        n.rules = DEFAULT_STATE().rules;
      } else {
        const D = DEFAULT_STATE().categories;
        for (const t of ["expense", "income"]) n.categories[t] = [...new Set([...n.categories[t], ...D[t]])];
        OLD_FIXED.forEach((c) => { if (!n.catMeta.expense[c]) n.catMeta.expense[c] = { group: "fixed" }; });
        n.rules = [...n.rules, ...SAVING_RULES.filter((r) => !n.rules.some((x) => x.kw === r.kw && x.toType === r.toType))];
      }
    }
    n.version = 3;
    return n;
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = normalize(JSON.parse(raw));
    } catch (e) { storageOk = false; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { storageOk = false; showBanner(); }
  }
  function showBanner() {
    const b = $("#banner");
    b.hidden = storageOk;
    if (!storageOk) b.textContent = "이 브라우저에서는 저장이 막혀 있어 새로고침하면 데이터가 사라집니다. 사생활 보호 모드를 끄거나 설정 > 백업으로 파일을 저장하세요.";
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2200);
  }

  const acc = (id) => state.accounts.find((a) => a.id === id);
  const accName = (id) => (acc(id) || { name: "(삭제된 계정)" }).name;
  const accOptions = (sel) => state.accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.name)}${a.last4 ? " (" + a.last4 + ")" : ""}</option>`).join("");
  const allCats = (type) => {
    const used = state.tx.filter((t) => t.type === type).map((t) => t.category);
    return [...new Set([...(state.categories[type] || []), ...used])];
  };
  const groupOf = (type, c) => {
    const m = (state.catMeta[type] || {})[c];
    return m && m.group ? m.group : type === "saving" ? "save" : "variable";
  };
  const opt = (c, sel) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`;
  // 지출·저축은 그룹(고정/변동, 저축/투자/상환)별로 묶어서 보여 준다
  const catOptions = (type, sel) => {
    const list = allCats(type);
    if (!GROUPS[type]) return list.map((c) => opt(c, sel)).join("");
    return Object.entries(GROUPS[type]).map(([g, label]) => {
      const items = list.filter((c) => groupOf(type, c) === g);
      return items.length ? `<optgroup label="${label}">${items.map((c) => opt(c, sel)).join("")}</optgroup>` : "";
    }).join("");
  };
  const budgetOf = (c) => ((state.catMeta.expense || {})[c] || {}).budget || 0;
  const settle = (ym) => L.settle(state.tx, ym, state.catMeta);
  const rate = (r) => (r == null ? "-" : (r * 100).toFixed(1) + "%");
  const defaultAcc = () => (state.accounts.find((a) => a.kind === "card" || a.kind === "check") || state.accounts[0]).id;
  const guess = (text) => L.guessAccount(text, state.accounts) || defaultAcc();

  // ---------- 화면 ----------
  function render() {
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.tab));
    $("#fab").hidden = ui.tab === "more" || (ui.tab === "asset" && ui.asub === "nw");
    renderTop();
    $("#view").innerHTML = { home: viewHome, list: viewList, asset: viewAsset, invest: viewInvest, more: viewMore }[ui.tab]();
  }

  function renderTop() {
    const t = $("#top");
    if (ui.tab === "more" || ui.tab === "invest" || (ui.tab === "asset" && ui.asub !== "nw")) { t.innerHTML = `<h1>${{ more: "설정", invest: "투자", asset: "자산" }[ui.tab]}</h1>`; return; }
    const [y, m] = ui.ym.split("-");
    t.innerHTML = `<h1>${{ home: "내 가계부", list: "내역", asset: "순자산" }[ui.tab]}</h1>
      <div class="month"><button data-act="prev" aria-label="이전 달">‹</button><span>${y}년 ${+m}월</span><button data-act="next" aria-label="다음 달">›</button></div>`;
  }

  // 비율은 순지출이 양수인 항목끼리의 합 기준(환불로 음수가 된 항목은 막대 없이 금액만 표시)
  function bars(arr, attr) {
    if (!arr.length) return '<div class="empty">이번 달 지출 내역이 없습니다.</div>';
    const base = arr.reduce((s, x) => s + (x.v > 0 ? x.v : 0), 0);
    return arr.map((x) => `<div class="bar-row tap" ${attr}="${esc(x.key)}"><div class="meta"><span>${esc(x.label)}</span><span>${won(x.v)} <span class="sub">${x.v > 0 && base > 0 ? Math.round((x.v / base) * 100) + "%" : ""}</span></span></div><div class="bar"><i style="width:${x.v > 0 && base > 0 ? (x.v / base) * 100 : 0}%"></i></div></div>`).join("");
  }

  // 지출 비중 도넛: 상위 6개 + 그 외. 색은 고정 순서로 배정(순위가 바뀌어도 같은 분류는 화면 안에서 한 번만 쓰임)
  function donut(entries, total) {
    const pos = entries.filter((x) => x.v > 0);
    const top = pos.slice(0, 6);
    const rest = pos.slice(6).reduce((s, x) => s + x.v, 0);
    if (rest > 0) top.push({ key: "", label: `그 외 ${pos.length - 6}개`, v: rest, other: true });
    const base = top.reduce((s, x) => s + x.v, 0);
    if (!base) return '<div class="empty">이번 달 지출 내역이 없습니다.</div>';
    const R = 42, C = 2 * Math.PI * R;
    let off = 0;
    const segs = top.map((x, i) => {
      const len = (x.v / base) * C;
      const col = x.other ? "var(--s-other)" : `var(--s${i + 1})`;
      const seg = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${Math.max(0, len - (top.length > 1 ? 2 : 0))} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)" ${x.other ? "" : `data-gocat="${esc(x.key)}" class="tap"`}><title>${esc(x.label)} ${won(x.v)} (${Math.round((x.v / base) * 100)}%)</title></circle>`;
      off += len;
      return seg;
    }).join("");
    const legend = top.map((x, i) => `<div class="lg ${x.other ? "" : "tap"}" ${x.other ? "" : `data-gocat="${esc(x.key)}"`}><i style="background:${x.other ? "var(--s-other)" : `var(--s${i + 1})`}"></i><span class="n">${esc(x.label)}</span><span>${won(x.v)}</span><span class="sub p">${Math.round((x.v / base) * 100)}%</span></div>`).join("");
    return `<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="분류별 지출 비중"><circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--line)" stroke-width="16"></circle>${segs}
      <text x="60" y="56" text-anchor="middle" class="d-l">총 지출</text><text x="60" y="72" text-anchor="middle" class="d-v">${man(total)}</text></svg><div class="legend">${legend}</div></div>`;
  }
  // 도넛 가운데처럼 좁은 곳에 쓰는 만 원 단위 표기
  const man = (n) => (Math.abs(n) >= 1e4 ? (n / 1e4).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "만" : Math.round(n).toLocaleString("ko-KR")) + "원";

  function budgetAlerts(s) {
    const over = [], near = [];
    for (const c of allCats("expense")) {
      const b = budgetOf(c); if (!b) continue;
      const v = s.byCat[c] || 0;
      if (v > b) over.push(`${c} ${won(v - b)} 초과`); else if (v >= b * 0.8) near.push(`${c} ${Math.round((v / b) * 100)}% 사용`);
    }
    const tb = state.settings.budget;
    if (tb > 0 && s.consume > tb) over.unshift(`전체 예산 ${won(s.consume - tb)} 초과`);
    if (!over.length && !near.length) return "";
    return `<div class="card alert ${over.length ? "bad" : ""}"><b>${over.length ? "예산 초과" : "예산 주의"}</b>
      ${over.map((x) => `<div>⚠ ${esc(x)}</div>`).join("")}${near.map((x) => `<div class="sub">● ${esc(x)}</div>`).join("")}</div>`;
  }

  function viewHome() {
    const s = settle(ui.ym);
    const accs = Object.entries(s.byAcc).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ key: id, label: accName(id), v }));
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, v }));
    const budget = state.settings.budget;
    const trend = L.monthlyTrend(state.tx, ui.ym, 6).map((t) => ({ ym: t.ym, ...settle(t.ym) }));
    const maxT = Math.max(1, ...trend.map((t) => Math.max(t.consume, t.saveAll)));
    const loanM = state.loanRecs.filter((r) => r.date.slice(0, 7) === ui.ym);
    const lp = loanM.reduce((a, r) => a + (+r.principal || 0) + (+r.extra || 0), 0), li = loanM.reduce((a, r) => a + (+r.interest || 0), 0);
    let html = "";
    const lb = state.settings.lastBackup;
    if (state.tx.length && (!lb || daysSince(lb) >= 30)) {
      html += `<div class="card warn">${lb ? `마지막 백업이 ${daysSince(lb)}일 전입니다.` : "아직 백업한 적이 없습니다."} 데이터는 이 브라우저에만 있으니 백업 파일을 저장해 두세요. <button class="btn" data-act="export" style="margin-top:8px">지금 백업</button></div>`;
    }
    html += budgetAlerts(s);
    html += `<div class="card"><div class="grid">
        <div class="stat"><div class="label">총수입</div><div class="value inc">${won(s.income)}</div></div>
        <div class="stat"><div class="label">총소비지출</div><div class="value exp">${won(s.consume)}</div></div>
        <div class="stat"><div class="label">저축·투자</div><div class="value inv">${won(s.saveAll)}</div></div>
        <div class="stat"><div class="label">잔여자금</div><div class="value ${s.left < 0 ? "exp" : ""}">${won(s.left)}</div></div>
      </div>`;
    if (budget > 0) {
      const used = s.consume / budget;
      html += `<div class="bar-row" style="margin-top:14px"><div class="meta"><span>전체 예산 ${won(budget)}</span><span class="${used > 1 ? "exp" : "sub"}">${used > 1 ? won(s.consume - budget) + " 초과" : won(budget - s.consume) + " 남음"}</span></div>
        <div class="bar"><i style="width:${Math.min(100, Math.max(0, used * 100))}%;${used > 1 ? "background:var(--exp)" : ""}"></i></div></div>`;
    }
    html += `</div>`;
    // 월 결산표 (사진의 결산 항목 순서)
    const line = (k, v, f, cls) => `<tr><th>${k}<div class="fx">${f}</div></th><td class="${cls || ""}">${v}</td></tr>`;
    html += `<div class="card"><h2>${+ui.ym.slice(5)}월 결산</h2><div class="scroll-x"><table class="settle">
      ${line("월 총수입", won(s.income), "급여 + 기타 수입", "inc")}
      ${line("월 고정지출", won(s.fixed), "고정지출 합계")}
      ${line("월 변동지출", won(s.variable), "변동지출 합계")}
      ${line("월 총소비지출", won(s.consume), "고정 + 변동", "exp")}
      ${line("월 저축액", won(s.save), "예금·적금 등")}
      ${line("월 투자금", won(s.invest), "투자계좌 신규 납입")}
      ${line("월 대출 추가 상환", won(s.repay), "정기 상환 외")}
      ${line("월 대출 원금 상환액", won(lp), "정기 + 추가 상환 (대출 관리 기록)")}
      ${line("월 대출 이자", won(li), "대출 관리 기록")}
      ${line("월 잔여자금", won(s.left), "수입 − 소비 − 저축·투자", s.left < 0 ? "exp" : "")}
      ${line("소비율", rate(s.consumeRate), "소비지출 ÷ 총수입")}
      ${line("저축·투자율", rate(s.saveRate), "저축·투자액 ÷ 총수입", "inv")}
      </table></div><div class="hint">이체(카드대금 등)는 제외합니다. 대출 원리금은 고정지출 '대출'에 포함되고, 원금·이자는 자산 &gt; 대출에서 상환을 기록하면 나뉘어 표시됩니다.</div></div>`;
    // 지출 비중
    const fv = s.fixed + s.variable;
    html += `<div class="card"><h2>지출 비중 <span class="sub">· 누르면 내역</span></h2>${donut(cats, s.consume)}
      ${fv > 0 && s.fixed >= 0 && s.variable >= 0 ? `<div class="split"><i style="width:${(s.fixed / fv) * 100}%;background:var(--s1)"></i><i style="width:${(s.variable / fv) * 100}%;background:var(--s2)"></i></div>
      <div class="meta sub" style="font-size:13px"><span><b class="dot" style="background:var(--s1)"></b>고정 ${won(s.fixed)} (${Math.round((s.fixed / fv) * 100)}%)</span><span><b class="dot" style="background:var(--s2)"></b>변동 ${won(s.variable)} (${Math.round((s.variable / fv) * 100)}%)</span></div>` : ""}</div>`;
    // 분류별 예산·지출
    const withBudget = [...new Set([...cats.map((c) => c.key), ...allCats("expense").filter(budgetOf)])];
    html += `<div class="card"><h2>분류별 지출·예산 <span class="sub">· 예산은 설정 &gt; 분류에서</span></h2>${withBudget.length ? withBudget.map((c) => {
      const v = s.byCat[c] || 0, b = budgetOf(c);
      const w = b ? Math.min(100, Math.max(0, (v / b) * 100)) : s.consume > 0 ? Math.max(0, (v / s.consume) * 100) : 0;
      const st = b ? (v > b ? `<span class="exp">${won(v - b)} 초과</span>` : `<span class="sub">${won(b - v)} 남음</span>`) : "";
      return `<div class="bar-row tap" data-gocat="${esc(c)}"><div class="meta"><span>${esc(c)} <span class="chip">${GROUPS.expense[groupOf("expense", c)]}</span></span><span>${won(v)}${b ? ` <span class="sub">/ ${won(b)}</span>` : ""}</span></div>
        <div class="bar ${b ? "" : "thin"}"><i style="width:${w}%;${b && v > b ? "background:var(--exp)" : b && v >= b * 0.8 ? "background:var(--warn)" : ""}"></i></div>${st ? `<div class="meta" style="font-size:12px"><span></span>${st}</div>` : ""}</div>`;
    }).join("") : '<div class="empty">이번 달 지출 내역이 없습니다.</div>'}</div>`;
    // 지난달 대비
    const cmp = L.compareMonths(state.tx, ui.ym, "expense");
    const ps = settle(L.prevYm(ui.ym));
    const d = s.consume - ps.consume;
    const arrow = (x) => (x > 0 ? `<span class="exp">▲ ${won(x)}</span>` : x < 0 ? `<span class="inc">▼ ${won(-x)}</span>` : '<span class="sub">변동 없음</span>');
    html += `<div class="card"><h2>지난달(${+L.prevYm(ui.ym).slice(5)}월) 대비</h2>
      <div class="meta"><b>총소비지출</b><span>${arrow(d)} <span class="sub">${ps.consume > 0 ? pct(d / ps.consume) : ""}</span></span></div>
      ${cmp.length ? `<div class="scroll-x"><table class="cmp"><tr><th>분류</th><th>지난달</th><th>이번 달</th><th>증감</th></tr>${(ui.cmpAll ? cmp : cmp.slice(0, 6)).map((x) => `<tr class="tap" data-gocat="${esc(x.cat)}"><td>${esc(x.cat)}</td><td>${won(x.prev)}</td><td>${won(x.cur)}</td><td>${arrow(x.diff)}${x.rate != null ? `<div class="sub" style="font-size:11px">${pct(x.rate)}</div>` : ""}</td></tr>`).join("")}</table></div>
      ${cmp.length > 6 ? `<button class="btn sm" data-act="cmp-all" style="margin-top:8px">${ui.cmpAll ? "접기" : `전체 ${cmp.length}개 보기`}</button>` : ""}` : '<div class="empty">비교할 지출이 없습니다.</div>'}</div>`;
    html += `<div class="card"><h2>카드·계좌별 지출 <span class="sub">· 누르면 내역</span></h2>${bars(accs, "data-goacc")}</div>
      <div class="card"><h2>최근 6개월 <span class="sub"><b class="dot" style="background:var(--s1)"></b>소비 <b class="dot" style="background:var(--s3)"></b>저축·투자</span></h2>${trend.map((t) => `<div class="bar-row" ${t.ym === ui.ym ? "" : 'style="opacity:.6"'}><div class="meta"><span>${+t.ym.slice(5)}월</span><span>${won(t.consume)} <span class="sub">· ${won(t.saveAll)}</span></span></div><div class="bar thin"><i style="width:${Math.max(0, (t.consume / maxT) * 100)}%;background:var(--s1)"></i></div><div class="bar thin" style="margin-top:2px"><i style="width:${Math.max(0, (t.saveAll / maxT) * 100)}%;background:var(--s3)"></i></div></div>`).join("")}</div>`;
    return html;
  }

  function filteredTx() {
    const q = ui.q.trim().toLowerCase();
    return state.tx.filter((t) => t.date.slice(0, 7) === ui.ym
      && (!ui.fAcc || t.accountId === ui.fAcc)
      && (!ui.fType || t.type === ui.fType)
      && (!ui.fCat || t.category === ui.fCat)
      && (!q || (t.memo + " " + t.category).toLowerCase().includes(q)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function viewList() {
    const cats = [...new Set(state.tx.map((t) => t.category))].sort();
    return `<div class="filters">
      <select data-f="fAcc"><option value="">전체 카드·계좌</option>${state.accounts.map((a) => `<option value="${a.id}" ${ui.fAcc === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
      <select data-f="fType"><option value="">전체 구분</option>${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${ui.fType === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    </div><div class="filters">
      <select data-f="fCat"><option value="">전체 분류</option>${cats.map((c) => `<option ${ui.fCat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <input data-f="q" type="search" placeholder="가맹점 검색" value="${esc(ui.q)}">
    </div><div id="list-body">${listBody()}</div>`;
  }

  function listBody() {
    const list = filteredTx();
    if (!list.length) return '<div class="empty">내역이 없습니다. 오른쪽 아래 + 버튼으로 추가하세요.</div>';
    const exp = list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const inc = list.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const sav = list.filter((t) => t.type === "saving").reduce((s, t) => s + t.amount, 0);
    let html = `<div class="day"><span>${list.length}건</span><span>수입 ${won(inc)} · 지출 ${won(exp)}${sav ? ` · 저축 ${won(sav)}` : ""}</span></div>`;
    const byDay = {};
    list.forEach((t) => (byDay[t.date] = byDay[t.date] || []).push(t));
    for (const d of Object.keys(byDay).sort().reverse()) {
      const dayExp = byDay[d].filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      const wd = "일월화수목금토"[new Date(d + "T00:00:00").getDay()];
      html += `<div class="day"><span>${+d.slice(5, 7)}월 ${+d.slice(8)}일 (${wd})</span><span>${dayExp ? "지출 " + won(dayExp) : ""}</span></div><div>`;
      html += byDay[d].map((t) => `<div class="row" data-edit="${t.id}"><div class="l"><div class="t">${esc(t.memo || t.category)}</div><div class="s">${esc(t.category)} · ${esc(accName(t.accountId))}${t.type === "transfer" ? '<span class="chip">이체</span>' : t.type === "saving" ? '<span class="chip">저축·투자</span>' : ""}${t.loanRec ? '<span class="chip">대출 기록</span>' : ""}</div></div>
        <div class="r ${t.type === "income" ? "inc" : t.type === "expense" ? "exp" : t.type === "saving" ? "inv" : "sub"}">${t.type === "income" ? "+" : t.type === "expense" ? (t.amount < 0 ? "+" : "-") : ""}${won(Math.abs(t.amount))}</div></div>`).join("");
      html += "</div>";
    }
    return html;
  }

  function viewInvest() {
    const h = L.computeHoldings(state.trades, state.prices);
    const held = h.list.filter((x) => x.qty > 0);
    const rate = h.totalCost > 0 ? h.totalUnrealized / h.totalCost : null;
    let html = `<div class="card"><div class="grid">
      <div class="stat"><div class="label">평가금액</div><div class="value">${won(h.totalValue)}</div></div>
      <div class="stat"><div class="label">매입원가</div><div class="value">${won(h.totalCost)}</div></div>
      <div class="stat"><div class="label">평가손익</div><div class="value ${h.totalUnrealized < 0 ? "exp" : "inc"}">${won(h.totalUnrealized)}<div class="sub" style="font-size:12px;font-weight:400">${pct(rate)}</div></div></div>
      <div class="stat"><div class="label">실현손익 + 배당</div><div class="value">${won(h.totalRealized + h.totalDividend)}</div></div>
    </div><div class="hint">평균단가법, 원화 기준입니다. 현재가를 입력하지 않은 종목은 매입원가로 평가합니다.</div></div>`;
    html += '<div class="card"><h2>보유 종목</h2>';
    html += held.length ? held.map((x) => `<div class="bar-row"><div class="meta"><b>${esc(x.name)} <span class="sub">${esc(x.symbol)}</span></b><span>${x.qty.toLocaleString("ko-KR")}주</span></div>
      <div class="meta sub"><span>평균 ${won(x.avg)}</span><span>매입 ${won(x.cost)}</span></div>
      <div class="meta" style="margin-top:6px"><span><input class="price-in" data-price="${esc(x.symbol)}" inputmode="decimal" placeholder="현재가" value="${x.price != null ? x.price : ""}"></span>
      <span class="${x.unrealized == null ? "sub" : x.unrealized < 0 ? "exp" : "inc"}">${x.unrealized == null ? "현재가 입력" : won(x.unrealized) + " (" + pct(x.rate) + ")"}</span></div></div>`).join("")
      : '<div class="empty">보유 종목이 없습니다. + 버튼으로 매수를 기록하세요.</div>';
    html += "</div>";
    const trades = [...state.trades].sort((a, b) => (a.date < b.date ? 1 : -1));
    html += '<div class="card"><h2>매매·배당 기록</h2>';
    html += trades.length ? "</div><div>" + trades.map((t) => {
      const lab = { buy: "매수", sell: "매도", dividend: "배당" }[t.side];
      const amt = t.side === "dividend" ? t.price : t.qty * t.price;
      return `<div class="row" data-edit-trade="${t.id}"><div class="l"><div class="t">${esc(t.name || t.symbol)} <span class="chip">${lab}</span></div><div class="s">${t.date}${t.side === "dividend" ? "" : ` · ${t.qty.toLocaleString("ko-KR")}주 × ${won(t.price)}`}${t.fee ? " · 수수료 " + won(t.fee) : ""}</div></div><div class="r ${t.side === "sell" ? "inc" : t.side === "buy" ? "exp" : "inv"}">${won(amt)}</div></div>`;
    }).join("") + "</div>" : '<div class="empty">기록이 없습니다.</div></div>';
    return html;
  }

  // ---------- 자산 탭 ----------
  function viewAsset() {
    const seg = `<div class="seg" id="asub" style="margin-bottom:12px">${[["nw", "순자산"], ["loan", "대출"], ["goal", "저축 목표"]].map(([k, v]) => `<button type="button" data-asub="${k}" class="${ui.asub === k ? "on" : ""}">${v}</button>`).join("")}</div>`;
    return seg + { nw: viewNw, loan: viewLoans, goal: viewGoals }[ui.asub]();
  }

  const nwMonths = () => Object.keys(state.nw.months).filter((k) => Object.values(state.nw.months[k]).some((v) => +v)).sort();
  function nwSum() {
    const cur = L.netWorth(state.nw.items, state.nw.months[ui.ym]);
    const prevKey = nwMonths().filter((k) => k < ui.ym).pop();
    const prev = prevKey ? L.netWorth(state.nw.items, state.nw.months[prevKey]) : null;
    const d = prev ? cur.net - prev.net : null;
    return `<div class="grid">
      <div class="stat"><div class="label">총자산</div><div class="value">${won(cur.asset)}</div></div>
      <div class="stat"><div class="label">총부채</div><div class="value exp">${won(cur.debt)}</div></div>
      <div class="stat"><div class="label">순자산</div><div class="value ${cur.net < 0 ? "exp" : "inc"}">${won(cur.net)}</div></div>
      <div class="stat"><div class="label">${prev ? `${+prevKey.slice(5)}월 대비` : "전월 대비"}</div><div class="value ${d == null ? "sub" : d < 0 ? "exp" : "inc"}">${d == null ? "-" : (d > 0 ? "+" : "") + won(d)}</div></div></div>
      <div class="hint">순자산 = 총자산 − 총부채. 매월 말 기준 금액을 적으세요.</div>`;
  }
  // 순자산 추이: 단일 계열 막대(0 기준선), 마지막 값만 직접 표기하고 표로 전체 값을 보여 준다
  function nwChart(rows) {
    if (rows.length < 2) return '<div class="hint">2개월 이상 기록하면 추이 차트가 보입니다.</div>';
    const W = 320, H = 150, P = { l: 6, r: 6, t: 22, b: 20 };
    const vals = rows.map((r) => r.net);
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    const span = max - min || 1;
    const y = (v) => P.t + ((max - v) / span) * (H - P.t - P.b);
    const bw = (W - P.l - P.r) / rows.length;
    const bars = rows.map((r, i) => {
      const x = P.l + i * bw + bw * 0.18, w = bw * 0.64, y0 = y(0), y1 = y(r.net);
      const last = i === rows.length - 1;
      return `<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, Math.abs(y1 - y0)).toFixed(1)}" rx="3" fill="${r.net < 0 ? "var(--exp)" : "var(--s1)"}" opacity="${last ? 1 : 0.55}"><title>${r.ym} 순자산 ${won(r.net)}</title></rect>
        <text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ax">${+r.ym.slice(5)}월</text>${last ? `<text x="${Math.min(W - 4, x + w / 2).toFixed(1)}" y="${(Math.min(y0, y1) - 6).toFixed(1)}" text-anchor="end" class="lbl">${man(r.net)}</text>` : ""}`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 순자산 추이"><line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"></line>${bars}</svg>`;
  }
  function viewNw() {
    const vals = state.nw.months[ui.ym] || {};
    const item = (it) => `<div class="nw-row"><div class="l tap" data-nwitem="${it.id}"><div class="t">${esc(it.name)}</div><div class="s">${esc(it.hint || "")}</div></div>
      <input class="nw-in" data-nw="${it.id}" inputmode="numeric" placeholder="0" value="${vals[it.id] ? Number(vals[it.id]).toLocaleString("ko-KR") : ""}" aria-label="${esc(it.name)} 금액"></div>`;
    const rows = nwMonths().slice(-12).map((k) => ({ ym: k, ...L.netWorth(state.nw.items, state.nw.months[k]) }));
    return `<div class="card" id="nw-sum">${nwSum()}</div>
      <div class="card"><h2>자산 <span class="sub">· 이름을 누르면 수정</span></h2>${state.nw.items.filter((x) => x.side !== "debt").map(item).join("")}</div>
      <div class="card"><h2>부채</h2>${state.nw.items.filter((x) => x.side === "debt").map(item).join("")}</div>
      <div class="btns" style="margin-top:0;margin-bottom:12px"><button class="btn" data-act="nw-copy">지난 기록 복사</button><button class="btn" data-act="nw-auto">투자·대출 자동 채우기</button></div>
      <div class="btns" style="margin-top:0;margin-bottom:12px"><button class="btn" data-act="nw-add">+ 항목 추가</button></div>
      <div class="card"><h2>순자산 추이</h2>${nwChart(rows)}
      ${rows.length ? `<div class="scroll-x"><table class="cmp"><tr><th>월</th><th>총자산</th><th>총부채</th><th>순자산</th><th>증감</th></tr>${[...rows].reverse().map((r, i, arr) => { const p = arr[i + 1]; const dd = p ? r.net - p.net : null; return `<tr><td>${r.ym.slice(2).replace("-", ".")}</td><td>${man(r.asset)}</td><td>${man(r.debt)}</td><td><b>${man(r.net)}</b></td><td class="${dd == null ? "sub" : dd < 0 ? "exp" : "inc"}">${dd == null ? "-" : (dd > 0 ? "+" : "") + man(dd)}</td></tr>`; }).join("")}</table></div>` : ""}</div>`;
  }
  function nwItemForm(it) {
    const isNew = !it;
    it = it || { id: uid(), name: "", side: "asset", hint: "" };
    openSheet(`<h3>${isNew ? "순자산 항목 추가" : "항목 수정"}</h3>
      <label class="f">구분</label>${segHtml("ni-side", [["asset", "자산"], ["debt", "부채"]], it.side)}
      <label class="f">이름</label><input id="ni-name" value="${esc(it.name)}" placeholder="예: 전세보증금">
      <label class="f">설명 (선택)</label><input id="ni-hint" value="${esc(it.hint || "")}">
      <label class="f">자동 채우기</label><select id="ni-auto"><option value="">사용 안 함</option><option value="invest" ${it.auto === "invest" ? "selected" : ""}>투자 탭 평가금액</option></select>
      <div class="hint">대출 잔액은 자산 &gt; 대출에서 대출마다 연결할 항목을 고릅니다. 기본 '주식 자산'은 처음부터 투자 탭과 연결되어 있습니다.</div>
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="ni-del">삭제</button>'}<button class="btn" id="ni-cancel">취소</button><button class="btn primary" id="ni-save">저장</button></div>`);
    let side = it.side;
    bindSeg("ni-side", (v) => (side = v));
    $("#ni-cancel").onclick = closeSheet;
    $("#ni-save").onclick = () => {
      const name = $("#ni-name").value.trim();
      if (!name) return toast("이름을 입력하세요.");
      const next = { ...it, name, side, hint: $("#ni-hint").value.trim(), auto: $("#ni-auto").value || undefined };
      const i = state.nw.items.findIndex((x) => x.id === it.id);
      if (i >= 0) state.nw.items[i] = next; else state.nw.items.push(next);
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
    if (!isNew) $("#ni-del").onclick = async () => {
      if (!(await ask(`'${it.name}' 항목과 모든 달의 금액을 삭제할까요?`, "삭제"))) return;
      state.nw.items = state.nw.items.filter((x) => x.id !== it.id);
      Object.values(state.nw.months).forEach((m) => delete m[it.id]);
      state.loans.forEach((l) => { if (l.nwItem === it.id) l.nwItem = ""; });
      save(); render(); toast("삭제했습니다.");
    };
  }

  const loanOf = (id) => state.loans.find((l) => l.id === id);
  const remainMonths = (l) => Math.max(1, (Number(l.months) || 1) - L.loanLedger(l, state.loanRecs).rows.length);
  const ymLabel = (ym) => `${ym.slice(0, 4)}년 ${+ym.slice(5)}월`;
  function viewLoans() {
    if (!state.loans.length) return '<div class="card"><div class="empty">등록한 대출이 없습니다. 오른쪽 아래 + 버튼으로 대출을 추가하세요.</div><div class="hint">대출 종류, 최초 대출금, 금리, 상환 방식, 남은 기간, 상환 목표일을 넣으면 매월 원금·이자 상환과 잔액을 기록하고 추가 상환 효과를 계산할 수 있습니다.</div></div>';
    return state.loans.map((l) => {
      const { rows, balance } = L.loanLedger(l, state.loanRecs);
      const done = l.amount0 > 0 ? Math.min(1, Math.max(0, 1 - balance / l.amount0)) : 0;
      const tm = l.target ? L.monthsBetween(todayStr().slice(0, 7), l.target.slice(0, 7)) : null;
      const sumI = rows.reduce((a, r) => a + (+r.interest || 0), 0);
      return `<div class="card"><div class="meta tap" data-loan="${l.id}"><b>${esc(l.name)} <span class="chip">${esc(l.kind || "대출")}</span></b><span class="sub">수정 ›</span></div>
        <div class="grid" style="margin-top:10px">
          <div class="stat"><div class="label">현재 잔액</div><div class="value exp">${won(balance)}</div></div>
          <div class="stat"><div class="label">최초 대출금</div><div class="value">${won(l.amount0)}</div></div></div>
        <div class="bar-row"><div class="meta"><span>상환 진행률</span><span>${Math.round(done * 100)}%</span></div><div class="bar"><i style="width:${done * 100}%;background:var(--inc)"></i></div></div>
        <div class="meta sub" style="font-size:13px;flex-wrap:wrap;gap:4px 12px"><span>금리 ${l.rate}% · ${LOAN_METHOD[l.method] || ""}</span><span>남은 ${remainMonths(l)}개월</span>${l.target ? `<span>목표 ${l.target}${tm != null ? ` (${tm >= 0 ? tm + "개월 남음" : "지남"})` : ""}</span>` : ""}<span>기록된 이자 합계 ${won(sumI)}</span></div>
        <div class="btns"><button class="btn primary" data-loanrec-new="${l.id}">상환 기록</button><button class="btn" data-sim="${l.id}">상환 시뮬레이션</button></div>
        ${rows.length ? `<div class="scroll-x" style="margin-top:10px"><table class="cmp sm"><tr><th>날짜</th><th>전월 잔액</th><th>원금</th><th>이자</th><th>추가 상환</th><th>월말 잔액</th></tr>${[...rows].reverse().map((r) => `<tr class="tap" data-loanrec="${r.id}"><td>${r.date.slice(2).replace(/-/g, ".")}</td><td>${won(r.prev)}</td><td>${won(+r.principal || 0)}</td><td>${won(+r.interest || 0)}</td><td>${won(+r.extra || 0)}</td><td><b>${won(r.end)}</b></td></tr>`).join("")}</table></div>` : '<div class="hint">아직 상환 기록이 없습니다.</div>'}</div>`;
    }).join("");
  }
  function loanForm(l) {
    const isNew = !l;
    l = l || { id: uid(), name: "", kind: "주택담보대출", amount0: "", balance0: "", rate: "", method: "annuity", months: "", payment: "", target: "", nwItem: (state.nw.items.find((x) => x.id === "mortgage") || {}).id || "" };
    const hasRecs = state.loanRecs.some((r) => r.loanId === l.id);
    const debtItems = state.nw.items.filter((x) => x.side === "debt");
    openSheet(`<h3>${isNew ? "대출 추가" : "대출 수정"}</h3>
      <label class="f">대출 이름</label><input id="ln-name" value="${esc(l.name)}" placeholder="예: OO은행 주담대">
      <label class="f">대출 종류</label><input id="ln-kind" list="ln-kinds" value="${esc(l.kind)}"><datalist id="ln-kinds"><option>주택담보대출</option><option>전세자금대출</option><option>신용대출</option><option>자동차 할부</option><option>학자금대출</option></datalist>
      <div class="grid"><div><label class="f">최초 대출금 (원)</label><input id="ln-amount0" inputmode="numeric" value="${l.amount0 ? Number(l.amount0).toLocaleString("ko-KR") : ""}"></div>
      <div><label class="f">현재 잔액 (기록 시작 시점)</label><input id="ln-balance0" inputmode="numeric" placeholder="비우면 최초 대출금" value="${l.balance0 ? Number(l.balance0).toLocaleString("ko-KR") : ""}"></div>
      <div><label class="f">적용 금리 (연 %)</label><input id="ln-rate" inputmode="decimal" placeholder="예: 4.2" value="${l.rate}"></div>
      <div><label class="f">남은 상환 기간 (개월)</label><input id="ln-months" inputmode="numeric" placeholder="예: 300" value="${l.months}"></div></div>
      <label class="f">상환 방식</label>${segHtml("ln-method", Object.entries(LOAN_METHOD), l.method)}
      <label class="f">월 정기 상환액 (원리금, 비우면 자동 계산)</label><input id="ln-payment" inputmode="numeric" value="${l.payment ? Number(l.payment).toLocaleString("ko-KR") : ""}">
      <label class="f">상환 목표일</label><input id="ln-target" type="date" value="${esc(l.target)}">
      <label class="f">순자산에 반영할 부채 항목</label><select id="ln-nw"><option value="">반영 안 함</option>${debtItems.map((x) => `<option value="${x.id}" ${l.nwItem === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
      ${hasRecs ? '<div class="hint">상환 기록이 있는 대출의 시작 잔액을 바꾸면 모든 기록의 전월·월말 잔액이 다시 계산됩니다.</div>' : ""}
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="ln-del">삭제</button>'}<button class="btn" id="ln-cancel">취소</button><button class="btn primary" id="ln-save">저장</button></div>`);
    let method = l.method;
    bindSeg("ln-method", (v) => (method = v));
    $("#ln-cancel").onclick = closeSheet;
    $("#ln-save").onclick = () => {
      const name = $("#ln-name").value.trim();
      const amount0 = L.parseAmount($("#ln-amount0").value);
      const b0 = $("#ln-balance0").value.trim() ? L.parseAmount($("#ln-balance0").value) : amount0;
      const rt = L.parseAmount($("#ln-rate").value);
      const months = L.parseAmount($("#ln-months").value);
      const payment = $("#ln-payment").value.trim() ? L.parseAmount($("#ln-payment").value) : 0;
      if (!name) return toast("대출 이름을 입력하세요.");
      if (!(amount0 > 0) || !(b0 >= 0) || b0 > amount0) return toast("대출금과 잔액을 확인하세요. 잔액은 최초 대출금보다 클 수 없습니다.");
      if (!(rt >= 0) || rt > 100) return toast("금리를 % 단위로 입력하세요.");
      if (!(months >= 1)) return toast("남은 상환 기간을 개월 수로 입력하세요.");
      if (!(payment >= 0)) return toast("월 상환액을 확인하세요.");
      const next = { ...l, name, kind: $("#ln-kind").value.trim(), amount0, balance0: b0, rate: rt, months: Math.round(months), method, payment, target: $("#ln-target").value, nwItem: $("#ln-nw").value };
      const i = state.loans.findIndex((x) => x.id === l.id);
      if (i >= 0) state.loans[i] = next; else state.loans.push(next);
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
    if (!isNew) $("#ln-del").onclick = async () => {
      const recs = state.loanRecs.filter((r) => r.loanId === l.id);
      if (!(await ask(`'${l.name}'과(와) 상환 기록 ${recs.length}건을 삭제할까요? 기록으로 만든 가계부 내역도 함께 삭제됩니다.`, "삭제"))) return;
      const ids = new Set(recs.map((r) => r.id));
      state.tx = state.tx.filter((t) => !ids.has(t.loanRec));
      state.loanRecs = state.loanRecs.filter((r) => r.loanId !== l.id);
      state.loans = state.loans.filter((x) => x.id !== l.id);
      save(); render(); toast("삭제했습니다.");
    };
  }
  // 상환 기록을 저장하면 가계부 내역(원리금 → 고정지출 '대출', 추가 상환 → 저축 '주택대출 추가 상환')도 함께 만든다
  function syncLoanTx(rec, loan) {
    state.tx = state.tx.filter((t) => t.loanRec !== rec.id);
    if (!rec.sync) return;
    const base = { date: rec.date, accountId: rec.accountId, loanRec: rec.id };
    const pi = (+rec.principal || 0) + (+rec.interest || 0);
    if (pi > 0) state.tx.push({ ...base, id: uid(), type: "expense", amount: pi, category: "대출", memo: `${loan.name} 원리금` });
    if (+rec.extra > 0) state.tx.push({ ...base, id: uid(), type: "saving", amount: +rec.extra, category: "주택대출 추가 상환", memo: `${loan.name} 추가 상환` });
  }
  function loanRecForm(loan, r) {
    const isNew = !r;
    const { rows, balance } = L.loanLedger(loan, state.loanRecs.filter((x) => !r || x.id !== r.id));
    const prev = r ? (L.loanLedger(loan, state.loanRecs).rows.find((x) => x.id === r.id) || {}).prev : balance;
    const it = Math.round((prev * (Number(loan.rate) || 0)) / 100 / 12);
    const remain = Math.max(1, (Number(loan.months) || 1) - rows.length);
    const pay = loan.payment > 0 ? loan.payment : L.annuityPayment(prev, loan.rate, remain);
    const sugP = loan.method === "equal" ? prev / remain : loan.method === "bullet" ? 0 : Math.max(0, pay - it);
    const lastAcc = (state.loanRecs.filter((x) => x.loanId === loan.id).pop() || {}).accountId;
    r = r || { id: uid(), loanId: loan.id, date: todayStr(), principal: Math.round(Math.min(prev, sugP)), interest: it, extra: 0, accountId: lastAcc || (state.accounts.find((a) => a.kind === "bank") || state.accounts[0]).id, sync: true };
    const n = (v) => (v ? Number(v).toLocaleString("ko-KR") : "");
    openSheet(`<h3>${esc(loan.name)} 상환 ${isNew ? "기록" : "수정"}</h3>
      <div class="hint">전월 잔액 ${won(prev)}${isNew ? ` · 예상 이자 ${won(it)} (잔액 × 연 ${loan.rate}% ÷ 12)` : ""}. 실제 납부한 금액으로 고쳐 넣으세요.</div>
      <label class="f">납부일</label><input id="lr-date" type="date" value="${r.date}">
      <div class="grid"><div><label class="f">당월 원금 상환액</label><input id="lr-p" inputmode="numeric" value="${n(r.principal)}"></div>
      <div><label class="f">당월 이자 납부액</label><input id="lr-i" inputmode="numeric" value="${n(r.interest)}"></div>
      <div><label class="f">추가 상환액</label><input id="lr-e" inputmode="numeric" placeholder="0" value="${n(r.extra)}"></div>
      <div><label class="f">출금 계좌</label><select id="lr-acc">${accOptions(r.accountId)}</select></div></div>
      <label class="check"><input type="checkbox" id="lr-sync" ${r.sync ? "checked" : ""}> 가계부 내역에도 반영 (원리금 → 고정지출 '대출', 추가 상환 → 저축·투자)</label>
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="lr-del">삭제</button>'}<button class="btn" id="lr-cancel">취소</button><button class="btn primary" id="lr-save">저장</button></div>`);
    $("#lr-cancel").onclick = closeSheet;
    $("#lr-save").onclick = () => {
      const amt = (id) => ($(id).value.trim() ? L.parseAmount($(id).value) : 0);
      const next = { ...r, date: L.normDate($("#lr-date").value), principal: amt("#lr-p"), interest: amt("#lr-i"), extra: amt("#lr-e"), accountId: $("#lr-acc").value, sync: $("#lr-sync").checked };
      if (!next.date) return toast("날짜를 확인하세요.");
      if (![next.principal, next.interest, next.extra].every((v) => isFinite(v) && v >= 0)) return toast("금액을 확인하세요.");
      if (next.principal + next.extra > prev + 0.5) return toast(`원금 + 추가 상환이 잔액 ${won(prev)}보다 많습니다.`);
      const i = state.loanRecs.findIndex((x) => x.id === r.id);
      if (i >= 0) state.loanRecs[i] = next; else state.loanRecs.push(next);
      syncLoanTx(next, loan);
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
    if (!isNew) $("#lr-del").onclick = () => {
      state.loanRecs = state.loanRecs.filter((x) => x.id !== r.id);
      state.tx = state.tx.filter((t) => t.loanRec !== r.id);
      save(); closeSheet(); render(); toast("삭제했습니다.");
    };
  }
  function simSheet(loan) {
    const bal = L.loanLedger(loan, state.loanRecs).balance;
    const n = (v) => (v ? Math.round(v).toLocaleString("ko-KR") : "");
    openSheet(`<h3>대출 상환 시뮬레이션</h3><div class="hint">${esc(loan.name)} · ${LOAN_METHOD[loan.method]}. 금리가 남은 기간 동안 그대로라고 가정합니다.</div>
      <div class="grid"><div><label class="f">현재 잔액</label><input id="sm-bal" inputmode="numeric" value="${n(bal)}"></div>
      <div><label class="f">연 금리 (%)</label><input id="sm-rate" inputmode="decimal" value="${loan.rate}"></div>
      <div><label class="f">남은 기간 (개월)</label><input id="sm-months" inputmode="numeric" value="${remainMonths(loan)}"></div>
      <div><label class="f">매월 추가 상환액</label><input id="sm-extra" inputmode="numeric" placeholder="예: 300,000" value=""></div></div>
      <div id="sm-out"></div>
      <div class="btns"><button class="btn" id="sm-close">닫기</button></div>`);
    const draw = () => {
      const o = { balance: L.parseAmount($("#sm-bal").value), rate: L.parseAmount($("#sm-rate").value) || 0, months: L.parseAmount($("#sm-months").value), method: loan.method, payment: loan.payment };
      const extra = $("#sm-extra").value.trim() ? L.parseAmount($("#sm-extra").value) : 0;
      if (!(o.balance > 0) || !(o.months >= 1) || !(extra >= 0)) { $("#sm-out").innerHTML = '<div class="hint">잔액·기간·추가 상환액을 확인하세요.</div>'; return; }
      const a = L.simulateLoan({ ...o, extra: 0 }), b = L.simulateLoan({ ...o, extra });
      if (a.months == null) { $("#sm-out").innerHTML = `<div class="card warn">월 상환액 ${won(a.payment)}으로는 이자도 갚지 못합니다. 대출 정보의 월 정기 상환액을 확인하세요.</div>`; return; }
      const end = (m) => ymLabel(L.prevYm(todayStr().slice(0, 7), -m));
      const regular = loan.method === "annuity" ? `월 ${won(a.payment)}` : loan.method === "equal" ? `월 원금 ${won(o.balance / o.months)} + 이자` : "만기까지 이자만 납부";
      let html = `<div class="card" style="margin-top:12px"><div class="scroll-x"><table class="cmp"><tr><th></th><th>현재대로</th><th>추가 상환 시</th></tr>
        <tr><td>정기 상환</td><td colspan="2">${regular}</td></tr>
        <tr><td>상환 기간</td><td>${a.months}개월</td><td><b>${b.months}개월</b></td></tr>
        <tr><td>완납 예상</td><td>${end(a.months)}</td><td><b>${end(b.months)}</b></td></tr>
        <tr><td>총 이자</td><td>${won(a.interest)}</td><td><b>${won(b.interest)}</b></td></tr></table></div>
        <div class="grid" style="margin-top:12px"><div class="stat"><div class="label">이자 절감</div><div class="value inc">${won(a.interest - b.interest)}</div></div>
        <div class="stat"><div class="label">기간 단축</div><div class="value inc">${a.months - b.months}개월</div></div></div></div>`;
      if (loan.target) {
        const tm = L.monthsBetween(todayStr().slice(0, 7), loan.target.slice(0, 7)); // 다음 달부터 납부한다고 보고 목표 월까지의 납부 횟수
        const need = tm > 0 ? L.requiredExtra(o, tm) : null;
        html += `<div class="hint">상환 목표일 ${loan.target}까지 갚으려면: ${need == null ? "목표일이 지났습니다." : need === 0 ? "추가 상환 없이도 가능합니다." : `매월 약 <b>${won(need)}</b>을 추가로 갚아야 합니다.`}</div>`;
      }
      $("#sm-out").innerHTML = html;
    };
    $("#sheet").oninput = draw;
    $("#sm-close").onclick = () => { $("#sheet").oninput = null; closeSheet(); };
    draw();
  }

  function viewGoals() {
    if (!state.goals.length) return '<div class="card"><div class="empty">저축 목표가 없습니다. 오른쪽 아래 + 버튼으로 연간 목표를 추가하세요.</div><div class="hint">저축·투자로 기록한 내역을 목표 연도 기준으로 합산해 달성률을 계산합니다.</div></div>';
    const today = todayStr();
    return state.goals.map((g) => {
      const p = L.goalProgress(state.tx, g, today);
      const r = p.rate == null ? 0 : Math.min(1, p.rate);
      return `<div class="card tap" data-goal="${g.id}"><div class="meta"><b>${esc(g.name)} <span class="chip">${g.year}년</span></b><span class="sub">수정 ›</span></div>
        <div class="meta" style="margin-top:8px"><span class="value-md inv">${won(p.done)}</span><span class="sub">/ ${won(p.target)}</span></div>
        <div class="bar"><i style="width:${r * 100}%;background:var(--inv)"></i></div>
        <div class="meta" style="margin-top:6px;font-size:13px"><span><b>달성률 ${rate(p.rate)}</b></span><span class="sub">${p.remain > 0 ? `남은 금액 ${won(p.remain)}` : "목표 달성"}</span></div>
        ${p.remain > 0 && p.perMonth != null ? `<div class="hint">남은 ${p.monthsLeft}개월 동안 매월 ${won(p.perMonth)}씩 저축하면 달성합니다.</div>` : ""}
        <div class="hint">대상: ${g.cats && g.cats.length ? g.cats.map(esc).join(", ") : "저축·투자 전체"}</div></div>`;
    }).join("");
  }
  function goalForm(g) {
    const isNew = !g;
    g = g || { id: uid(), name: `${todayStr().slice(0, 4)}년 저축 목표`, year: +todayStr().slice(0, 4), target: "", cats: [] };
    openSheet(`<h3>${isNew ? "저축 목표 추가" : "저축 목표 수정"}</h3>
      <label class="f">목표 이름</label><input id="gl-name" value="${esc(g.name)}">
      <div class="grid"><div><label class="f">연도</label><input id="gl-year" inputmode="numeric" value="${g.year}"></div>
      <div><label class="f">목표 금액 (원)</label><input id="gl-target" inputmode="numeric" value="${g.target ? Number(g.target).toLocaleString("ko-KR") : ""}" placeholder="예: 12,000,000"></div></div>
      <label class="f">합산할 저축·투자 분류 (하나도 고르지 않으면 전체)</label>
      <div class="chips">${allCats("saving").map((c) => `<label class="chip lg pick"><input type="checkbox" data-gcat="${esc(c)}" ${g.cats.includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="gl-del">삭제</button>'}<button class="btn" id="gl-cancel">취소</button><button class="btn primary" id="gl-save">저장</button></div>`);
    $("#gl-cancel").onclick = closeSheet;
    $("#gl-save").onclick = () => {
      const year = Math.round(L.parseAmount($("#gl-year").value));
      const target = L.parseAmount($("#gl-target").value);
      if (!(year >= 2000 && year <= 2100)) return toast("연도를 확인하세요.");
      if (!(target > 0)) return toast("목표 금액을 입력하세요.");
      const next = { ...g, name: $("#gl-name").value.trim() || `${year}년 저축 목표`, year, target, cats: [...$$("[data-gcat]")].filter((x) => x.checked).map((x) => x.dataset.gcat) };
      const i = state.goals.findIndex((x) => x.id === g.id);
      if (i >= 0) state.goals[i] = next; else state.goals.push(next);
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
    if (!isNew) $("#gl-del").onclick = () => { state.goals = state.goals.filter((x) => x.id !== g.id); save(); closeSheet(); render(); toast("삭제했습니다."); };
  }

  // 분류 수정: 이름 바꾸기(내역·규칙·목표에도 반영), 그룹, 월 예산, 삭제
  function catForm(type, name) {
    const used = state.tx.filter((t) => t.type === type && t.category === name).length;
    const meta = (state.catMeta[type] || {})[name] || {};
    openSheet(`<h3>${TYPE_LABEL[type]} 분류 수정</h3>
      <label class="f">이름</label><input id="cf-name" value="${esc(name)}">
      ${GROUPS[type] ? `<label class="f">그룹</label>${segHtml("cf-group", Object.entries(GROUPS[type]), groupOf(type, name))}` : ""}
      ${type === "expense" ? `<label class="f">월 예산 (원, 비우면 사용 안 함)</label><input id="cf-budget" inputmode="numeric" placeholder="예: 300,000" value="${meta.budget ? Number(meta.budget).toLocaleString("ko-KR") : ""}"><div class="hint">이번 달 지출이 예산의 80%를 넘으면 주의, 100%를 넘으면 홈에 초과 알림이 뜹니다.</div>` : ""}
      <div class="hint">이 분류를 쓰는 내역 ${used}건. 이름을 바꾸면 내역·자동 분류 규칙·저축 목표에도 바뀐 이름이 적용됩니다.</div>
      <div class="btns"><button class="btn danger" id="cf-del">삭제</button><button class="btn" id="cf-cancel">취소</button><button class="btn primary" id="cf-save">저장</button></div>`);
    let group = groupOf(type, name);
    if (GROUPS[type]) bindSeg("cf-group", (v) => (group = v));
    $("#cf-cancel").onclick = closeSheet;
    $("#cf-save").onclick = () => {
      const nn = $("#cf-name").value.trim();
      if (!nn) return toast("이름을 입력하세요.");
      if (nn !== name && allCats(type).includes(nn)) return toast("같은 이름의 분류가 이미 있습니다.");
      const budget = type === "expense" && $("#cf-budget").value.trim() ? L.parseAmount($("#cf-budget").value) : 0;
      if (!(budget >= 0)) return toast("예산 금액을 확인하세요.");
      const list = state.categories[type];
      const i = list.indexOf(name);
      if (i >= 0) list[i] = nn; else list.push(nn);
      if (nn !== name) {
        state.tx.forEach((t) => { if (t.type === type && t.category === name) t.category = nn; });
        state.rules.forEach((r) => { if (r.category === name) r.category = nn; });
        if (type === "saving") state.goals.forEach((g) => { g.cats = g.cats.map((c) => (c === name ? nn : c)); });
        if (state.catMeta[type]) delete state.catMeta[type][name];
      }
      if (state.catMeta[type]) state.catMeta[type][nn] = { ...meta, group, ...(type === "expense" ? { budget } : {}) };
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
    $("#cf-del").onclick = () => {
      if (used) return toast("사용 중인 분류는 삭제할 수 없습니다. 내역의 분류를 먼저 바꾸세요.");
      state.categories[type] = state.categories[type].filter((c) => c !== name);
      if (state.catMeta[type]) delete state.catMeta[type][name];
      save(); closeSheet(); render(); toast("삭제했습니다.");
    };
  }

  function viewMore() {
    const cnt = (id) => state.tx.filter((t) => t.accountId === id).length;
    const lb = state.settings.lastBackup;
    const chip = (type, c) => `<span class="chip lg"><button class="nm" data-cat-edit="${type}|${esc(c)}">${esc(c)}${type === "expense" && budgetOf(c) ? ` <span class="sub">${man(budgetOf(c))}</span>` : ""}</button><button data-del-cat="${type}|${esc(c)}" aria-label="${esc(c)} 삭제">×</button></span>`;
    const catBlock = (type) => {
      const add = `<button class="chip lg add" data-add-cat="${type}">+ 추가</button>`;
      if (!GROUPS[type]) return `<div style="margin-top:10px"><b style="font-size:13px">${TYPE_LABEL[type]}</b><div class="chips">${state.categories[type].map((c) => chip(type, c)).join("")}${add}</div></div>`;
      return Object.entries(GROUPS[type]).map(([g, label], i, arr) => {
        const items = state.categories[type].filter((c) => groupOf(type, c) === g);
        return `<div style="margin-top:10px"><b style="font-size:13px">${label}</b><div class="chips">${items.map((c) => chip(type, c)).join("")}${i === arr.length - 1 ? add : ""}</div></div>`;
      }).join("");
    };
    return `
      <div class="card"><h2>내역 가져오기</h2>
        <div class="btns" style="margin-top:0"><button class="btn primary" data-act="import-file">CSV·엑셀 업로드</button><button class="btn" data-act="import-sms">문자 붙여넣기</button></div>
        <div class="hint">카드사·은행 앱에서 받은 이용내역 파일이나 승인 문자를 넣으면 카드(끝 4자리·이름)와 열을 자동으로 찾습니다. 이미 있는 내역은 건너뜁니다.</div>
        <input id="file" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" hidden>
        ${state.batches.length ? `<div style="margin-top:12px"><b style="font-size:13px">최근 가져오기</b>${state.batches.slice(0, 5).map((b) => `<div class="meta bar-row"><span>${esc(b.label)} <span class="sub">${b.at.slice(5, 16).replace("T", " ")} · ${state.tx.filter((t) => t.batch === b.id).length}건</span></span><button class="btn danger sm" data-undo="${b.id}">되돌리기</button></div>`).join("")}</div>` : ""}</div>
      <div class="card"><h2>카드·계좌</h2>
        ${state.accounts.map((a) => `<div class="meta bar-row tap" data-acc="${a.id}"><span>${esc(a.name)}${a.last4 ? ` <span class="sub">${a.last4}</span>` : ""} <span class="chip">${KIND[a.kind] || a.kind}</span></span><span class="sub">${cnt(a.id)}건 ›</span></div>`).join("")}
        <div class="btns"><button class="btn" data-act="add-acc">+ 카드·계좌 추가</button></div>
        <div class="hint">같은 카드사 카드가 여러 장이면 카드번호 끝 4자리를 넣어 두세요. 승인 문자에서 자동으로 구분합니다.</div></div>
      <div class="card"><h2>전체 월 예산</h2>
        <input id="budget" inputmode="numeric" placeholder="예: 1,500,000 (0이면 사용 안 함)" value="${state.settings.budget ? state.settings.budget.toLocaleString("ko-KR") : ""}">
        <div class="hint">총소비지출(고정 + 변동)과 비교합니다. 분류별 예산은 아래 분류 이름을 눌러 정합니다.</div></div>
      <div class="card"><h2>지출 분류 <span class="sub">· 이름을 누르면 수정·그룹·예산</span></h2>${catBlock("expense")}</div>
      <div class="card"><h2>수입 분류</h2>${catBlock("income")}</div>
      <div class="card"><h2>저축·투자 분류</h2>${catBlock("saving")}<div class="hint">저축·투자는 지출에 넣지 않고 결산의 저축액·투자금·추가 상환으로 따로 집계합니다.</div></div>
      <div class="card"><h2>이체 분류</h2>${catBlock("transfer")}
        <div class="hint">사용 중인 분류는 삭제할 수 없습니다. 이체(카드대금, 내 계좌 간 이동)는 결산에서 빠집니다.</div></div>
      <div class="card"><h2>자동 분류 규칙</h2>
        <div class="hint" style="margin:0 0 8px">가맹점·적요에 키워드가 들어 있으면 분류를 자동 지정합니다. 위쪽 규칙이 먼저 적용됩니다.</div>
        ${state.rules.map((r, i) => `<div class="meta bar-row"><span>${esc(r.kw)} → ${esc(r.category)}${r.toType ? ` <span class="chip">${TYPE_LABEL[r.toType]}</span>` : ""}${r.type ? ` <span class="chip">${TYPE_LABEL[r.type]}만</span>` : ""}</span><button class="btn danger sm" data-del-rule="${i}">삭제</button></div>`).join("")}
        <div class="btns"><button class="btn" data-act="add-rule">+ 규칙 추가</button></div></div>
      <div class="card"><h2>백업</h2>
        <div class="hint" style="margin:0 0 8px">데이터는 이 브라우저 안에만 저장됩니다. 브라우저 데이터를 지우거나 기기를 바꾸면 사라지므로 주기적으로 백업하세요. 마지막 백업: ${lb ? lb.slice(0, 10) : "없음"}</div>
        <div class="btns" style="margin-top:0"><button class="btn primary" data-act="export">백업 파일 저장</button><button class="btn" data-act="restore">백업 불러오기</button></div>
        <input id="restore-file" type="file" accept=".json,application/json" hidden>
        <div class="btns"><button class="btn" data-act="export-csv">내역 CSV 내보내기 (엑셀)</button></div>
        <div class="btns"><button class="btn danger" data-act="wipe">모든 데이터 삭제</button></div>
        <div class="hint">저장된 내역 ${state.tx.length}건, 투자 기록 ${state.trades.length}건</div></div>`;
  }

  // ---------- 시트(모달) ----------
  function openSheet(html) { $("#sheet").innerHTML = html; $("#overlay").hidden = false; }
  function closeSheet() { $("#overlay").hidden = true; $("#sheet").innerHTML = ""; }
  function ask(msg, okLabel) {
    return new Promise((resolve) => {
      openSheet(`<h3>확인</h3><p>${esc(msg)}</p><div class="btns"><button class="btn" id="ask-no">취소</button><button class="btn primary" id="ask-yes">${esc(okLabel || "확인")}</button></div>`);
      $("#ask-no").onclick = () => { closeSheet(); resolve(false); };
      $("#ask-yes").onclick = () => { closeSheet(); resolve(true); };
    });
  }
  function askText(title, placeholder) {
    return new Promise((resolve) => {
      openSheet(`<h3>${esc(title)}</h3><input id="ask-in" placeholder="${esc(placeholder || "")}"><div class="btns"><button class="btn" id="ask-no">취소</button><button class="btn primary" id="ask-yes">확인</button></div>`);
      $("#ask-in").focus();
      $("#ask-no").onclick = () => { closeSheet(); resolve(null); };
      $("#ask-yes").onclick = () => { const v = $("#ask-in").value.trim(); closeSheet(); resolve(v || null); };
    });
  }
  const segHtml = (id, items, sel) => `<div class="seg" id="${id}">${items.map(([k, v]) => `<button type="button" data-v="${k}" class="${sel === k ? "on" : ""}">${v}</button>`).join("")}</div>`;
  const bindSeg = (id, cb) => {
    $("#" + id).onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$(`#${id} button`).forEach((x) => x.classList.toggle("on", x === b));
      cb(b.dataset.v);
    };
  };

  // 새 규칙을 맨 위에 추가하고, 아직 기본 분류(기타)인 기존 내역에도 적용한다
  function addRule(rule) {
    state.rules = state.rules.filter((r) => r.kw !== rule.kw);
    state.rules.unshift(rule);
    let n = 0;
    for (const t of state.tx) {
      if ((t.category === "기타" || t.category === "기타수입") && t.memo.toLowerCase().includes(rule.kw.toLowerCase()) && (!rule.type || rule.type === t.type)) {
        if (rule.toType) t.type = rule.toType;
        t.category = rule.category; n++;
      }
    }
    return n;
  }

  function txForm(t) {
    const isNew = !t;
    t = t || { id: uid(), type: "expense", date: todayStr(), amount: "", accountId: ui.fAcc || defaultAcc(), category: "", memo: "" };
    openSheet(`<h3>${isNew ? "내역 추가" : "내역 수정"}</h3>
      <label class="f">구분</label>${segHtml("tx-type", Object.entries(TYPE_LABEL), t.type)}
      <label class="f">날짜</label><input id="tx-date" type="date" value="${t.date}">
      <label class="f">금액 (지출 환불은 음수)</label><input id="tx-amount" inputmode="decimal" placeholder="0" value="${t.amount}">
      <label class="f">카드·계좌</label><select id="tx-acc">${accOptions(t.accountId)}</select>
      <label class="f">분류</label><select id="tx-cat">${catOptions(t.type, t.category)}</select>
      <label class="f">가맹점·메모</label><input id="tx-memo" value="${esc(t.memo)}">
      <label class="check"><input type="checkbox" id="tx-rule"> 같은 가맹점은 앞으로 이 분류로 자동 분류</label>
      ${t.loanRec ? '<div class="hint">대출 상환 기록으로 만든 내역입니다. 금액은 자산 &gt; 대출의 상환 기록에서 고치면 함께 바뀝니다.</div>' : ""}
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="tx-del">삭제</button>'}<button class="btn" id="tx-cancel">취소</button><button class="btn primary" id="tx-save">저장</button></div>`);
    let type = t.type;
    bindSeg("tx-type", (v) => { type = v; $("#tx-cat").innerHTML = catOptions(type, ""); });
    $("#tx-cancel").onclick = closeSheet;
    if (!isNew) $("#tx-del").onclick = () => { state.tx = state.tx.filter((x) => x.id !== t.id); save(); closeSheet(); render(); toast("삭제했습니다."); };
    $("#tx-save").onclick = () => {
      const amount = L.parseAmount($("#tx-amount").value);
      const date = L.normDate($("#tx-date").value);
      if (!isFinite(amount) || amount === 0) return toast("금액을 확인하세요.");
      if (!date) return toast("날짜를 확인하세요.");
      const memo = $("#tx-memo").value.trim();
      const next = { ...t, type, date, amount: type === "expense" ? amount : Math.abs(amount), accountId: $("#tx-acc").value, category: $("#tx-cat").value || "기타", memo };
      const i = state.tx.findIndex((x) => x.id === t.id);
      if (i >= 0) state.tx[i] = next; else state.tx.push(next);
      let msg = "저장했습니다.";
      if ($("#tx-rule").checked && memo) {
        const n = addRule({ kw: memo, category: next.category, ...(type === "transfer" || type === "saving" ? { toType: type } : type === "income" ? { type: "income" } : {}) });
        msg = `저장하고 규칙을 추가했습니다${n ? ` (기존 ${n}건에도 적용)` : ""}.`;
      }
      // 예산 초과 알림
      if (type === "expense" && budgetOf(next.category)) {
        const b = budgetOf(next.category), v = settle(date.slice(0, 7)).byCat[next.category] || 0;
        if (v > b) msg = `${next.category} 예산을 ${won(v - b)} 초과했습니다.`;
        else if (v >= b * 0.8) msg = `${next.category} 예산의 ${Math.round((v / b) * 100)}%를 썼습니다.`;
      }
      ui.ym = date.slice(0, 7);
      save(); closeSheet(); render(); toast(msg);
    };
  }

  function accountForm(a) {
    const isNew = !a;
    a = a || { id: uid(), name: "", kind: "card", last4: "" };
    const count = state.tx.filter((t) => t.accountId === a.id).length;
    const others = state.accounts.filter((x) => x.id !== a.id);
    openSheet(`<h3>${isNew ? "카드·계좌 추가" : "카드·계좌 수정"}</h3>
      <label class="f">이름 (예: 신한카드 Deep Dream, 국민은행 급여통장)</label><input id="ac-name" value="${esc(a.name)}">
      <label class="f">종류</label><select id="ac-kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${a.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <label class="f">카드·계좌번호 끝 4자리 (선택)</label><input id="ac-last4" inputmode="numeric" maxlength="4" value="${esc(a.last4)}">
      ${!isNew && count && others.length ? `<label class="f">삭제할 때 내역 ${count}건을 옮길 곳</label><select id="ac-move">${others.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>` : ""}
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="ac-del">삭제</button>'}<button class="btn" id="ac-cancel">취소</button><button class="btn primary" id="ac-save">저장</button></div>`);
    $("#ac-cancel").onclick = closeSheet;
    $("#ac-save").onclick = () => {
      const name = $("#ac-name").value.trim();
      const last4 = $("#ac-last4").value.trim();
      if (!name) return toast("이름을 입력하세요.");
      if (last4 && !/^\d{4}$/.test(last4)) return toast("끝 4자리는 숫자 4개입니다.");
      if (last4 && state.accounts.some((x) => x.id !== a.id && x.last4 === last4)) return toast("같은 끝 4자리를 쓰는 카드가 이미 있습니다.");
      const next = { ...a, name, kind: $("#ac-kind").value, last4 };
      const i = state.accounts.findIndex((x) => x.id === a.id);
      if (i >= 0) state.accounts[i] = next; else state.accounts.push(next);
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
    if (!isNew) $("#ac-del").onclick = async () => {
      if (!others.length) return toast("카드·계좌가 최소 1개는 필요합니다.");
      const to = count ? $("#ac-move").value : null;
      if (!(await ask(count ? `내역 ${count}건을 '${accName(to)}'(으)로 옮기고 '${a.name}'을(를) 삭제할까요?` : `'${a.name}'을(를) 삭제할까요?`, "삭제"))) return;
      if (to) state.tx.forEach((t) => { if (t.accountId === a.id) t.accountId = to; });
      state.accounts = others;
      if (ui.fAcc === a.id) ui.fAcc = "";
      save(); closeSheet(); render(); toast("삭제했습니다.");
    };
  }

  function ruleForm() {
    openSheet(`<h3>자동 분류 규칙 추가</h3>
      <label class="f">키워드 (가맹점·적요에 포함된 글자)</label><input id="ru-kw" placeholder="예: 김밥천국">
      <label class="f">적용 대상</label>${segHtml("ru-type", [["expense", "지출"], ["income", "수입"], ["saving", "저축·투자로"], ["transfer", "이체로"]], "expense")}
      <label class="f">분류</label><select id="ru-cat">${catOptions("expense", "")}</select>
      <div class="hint">'저축·투자로'는 적금·증권계좌 입금처럼 결산의 저축·투자로 셀 출금에, '이체로'는 카드대금·내 계좌 간 이동처럼 수입·지출에서 빼야 하는 거래에 씁니다. 추가하면 아직 '기타'인 기존 내역에도 적용합니다.</div>
      <div class="btns"><button class="btn" id="ru-cancel">취소</button><button class="btn primary" id="ru-save">추가</button></div>`);
    let type = "expense";
    bindSeg("ru-type", (v) => { type = v; $("#ru-cat").innerHTML = catOptions(v, ""); });
    $("#ru-cancel").onclick = closeSheet;
    $("#ru-save").onclick = () => {
      const kw = $("#ru-kw").value.trim();
      if (!kw) return toast("키워드를 입력하세요.");
      const category = $("#ru-cat").value;
      // 지출 규칙은 type 없이 저장해 카드 환불·은행 출금에도 적용되게 한다(수입에는 applyRules가 적용하지 않음)
      const n = addRule({ kw, category, ...(type === "transfer" || type === "saving" ? { toType: type } : type === "income" ? { type: "income" } : {}) });
      save(); closeSheet(); render(); toast(`규칙을 추가했습니다${n ? ` (기존 ${n}건 적용)` : ""}.`);
    };
  }

  function tradeForm(t) {
    const isNew = !t;
    t = t || { id: uid(), side: "buy", date: todayStr(), symbol: "", name: "", qty: "", price: "", fee: "" };
    const syms = [...new Map(state.trades.map((x) => [x.symbol, x.name])).entries()];
    openSheet(`<h3>${isNew ? "매매·배당 기록" : "기록 수정"}</h3>
      <label class="f">구분</label>${segHtml("tr-side", [["buy", "매수"], ["sell", "매도"], ["dividend", "배당"]], t.side)}
      <label class="f">날짜</label><input id="tr-date" type="date" value="${t.date}">
      <label class="f">종목코드 (예: 005930, AAPL)</label><input id="tr-symbol" list="syms" value="${esc(t.symbol)}"><datalist id="syms">${syms.map(([s, n]) => `<option value="${esc(s)}">${esc(n)}</option>`).join("")}</datalist>
      <label class="f">종목명</label><input id="tr-name" value="${esc(t.name)}">
      <div id="tr-qtywrap"><label class="f">수량</label><input id="tr-qty" inputmode="decimal" value="${t.qty}"></div>
      <label class="f" id="tr-pricelabel">단가 (원)</label><input id="tr-price" inputmode="decimal" value="${t.price}">
      <label class="f">수수료·세금 (원)</label><input id="tr-fee" inputmode="decimal" value="${t.fee}">
      <div class="hint">외화 종목은 원화로 환산한 단가를 입력하세요.</div>
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="tr-del">삭제</button>'}<button class="btn" id="tr-cancel">취소</button><button class="btn primary" id="tr-save">저장</button></div>`);
    let side = t.side;
    const sync = () => {
      $("#tr-qtywrap").hidden = side === "dividend";
      $("#tr-pricelabel").textContent = side === "dividend" ? "배당금 (세후 원)" : "단가 (원)";
    };
    sync();
    bindSeg("tr-side", (v) => { side = v; sync(); });
    $("#tr-symbol").onchange = () => {
      const f = syms.find(([s]) => s === $("#tr-symbol").value.trim());
      if (f && !$("#tr-name").value) $("#tr-name").value = f[1] || "";
    };
    $("#tr-cancel").onclick = closeSheet;
    if (!isNew) $("#tr-del").onclick = () => { state.trades = state.trades.filter((x) => x.id !== t.id); save(); closeSheet(); render(); };
    $("#tr-save").onclick = () => {
      const symbol = $("#tr-symbol").value.trim();
      const qty = side === "dividend" ? 0 : L.parseAmount($("#tr-qty").value);
      const price = L.parseAmount($("#tr-price").value);
      const fee = $("#tr-fee").value.trim() === "" ? 0 : L.parseAmount($("#tr-fee").value);
      const date = L.normDate($("#tr-date").value);
      if (!symbol) return toast("종목코드를 입력하세요.");
      if (!date) return toast("날짜를 확인하세요.");
      if (!(price > 0) || (side !== "dividend" && !(qty > 0)) || !isFinite(fee) || fee < 0) return toast("수량·단가·수수료를 확인하세요.");
      if (side === "sell") {
        const others = state.trades.filter((x) => x.id !== t.id && x.symbol === symbol && x.date <= date);
        const h = L.computeHoldings(others, {}).list.find((x) => x.symbol === symbol);
        if (!h || h.qty + 1e-9 < qty) return toast("보유 수량보다 많이 매도할 수 없습니다.");
      }
      const next = { id: t.id, side, date, symbol, name: $("#tr-name").value.trim(), qty, price, fee };
      const i = state.trades.findIndex((x) => x.id === t.id);
      if (i >= 0) state.trades[i] = next; else state.trades.push(next);
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
  }

  // ---------- 가져오기 ----------
  function decodeText(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("euc-kr").decode(buf); } // 국내 카드사·은행 CSV는 EUC-KR인 경우가 많음
  }
  function loadSheetJS() {
    return new Promise((res, rej) => {
      if (window.XLSX) return res(window.XLSX);
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => res(window.XLSX);
      s.onerror = () => rej(new Error("엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV로 저장해서 올려 주세요."));
      document.head.appendChild(s);
    });
  }
  async function readFileRows(file) {
    const buf = await file.arrayBuffer();
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const X = await loadSheetJS();
      const wb = X.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return X.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "" });
    }
    return L.parseCSV(decodeText(buf));
  }

  function commitBatch(items, label) {
    const id = uid();
    items.forEach((t) => state.tx.push({ ...t, id: uid(), batch: id }));
    state.batches.unshift({ id, at: new Date().toISOString(), label, count: items.length });
    state.batches = state.batches.slice(0, 20);
  }

  function importSheet(rows, fileName) {
    let hi = L.findHeaderRow(rows);
    const manual = hi < 0;
    if (manual) hi = 0;
    const headers = rows[hi].map((x) => String(x == null ? "" : x).trim());
    const body = rows.slice(hi + 1);
    // 파일 이름과 헤더 위 제목 줄(카드명·카드번호가 들어 있는 경우가 많음)로 카드를 추정
    const titleText = rows.slice(0, hi).map((r) => r.join(" ")).join(" ");
    const model = { acc: guess(fileName + " " + titleText), sign: "", m: L.detectColumns(headers) };
    const draw = () => {
      const a = acc(model.acc);
      const hasSplit = model.m.out >= 0 || model.m.in >= 0;
      const signMode = model.sign || (a && (a.kind === "bank" || a.kind === "broker") && !hasSplit ? "signed" : "expense");
      const { tx, skipped } = L.rowsToTx(body, model.m, { accountId: model.acc, rules: state.rules, signMode, defaultYear: new Date().getFullYear() });
      const fresh = L.filterNew(state.tx, tx);
      const opt = (sel) => '<option value="-1">(없음)</option>' + headers.map((h, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${esc(h || "열 " + (i + 1))}</option>`).join("");
      openSheet(`<h3>가져오기 미리보기</h3><div class="hint">${esc(fileName)}${manual ? " · 헤더를 찾지 못했습니다. 아래에서 열을 직접 지정하세요." : ""}</div>
        <label class="f">이 파일의 카드·계좌</label><select id="im-acc">${accOptions(model.acc)}</select>
        <div class="grid"><div><label class="f">날짜 열</label><select data-m="date">${opt(model.m.date)}</select></div><div><label class="f">가맹점·적요 열</label><select data-m="memo">${opt(model.m.memo)}</select></div>
        <div><label class="f">금액 열</label><select data-m="amount">${opt(model.m.amount)}</select></div><div><label class="f">출금 열</label><select data-m="out">${opt(model.m.out)}</select></div>
        <div><label class="f">입금 열</label><select data-m="in">${opt(model.m.in)}</select></div>
        <div><label class="f">금액 부호</label><select id="im-sign"><option value="expense" ${signMode === "expense" ? "selected" : ""}>양수 = 지출 (카드)</option><option value="signed" ${signMode === "signed" ? "selected" : ""}>음수 = 지출, 양수 = 수입</option></select></div></div>
        <div class="card" style="margin-top:12px"><b>새로 추가 ${fresh.length}건</b> <span class="sub">· 이미 있음 ${tx.length - fresh.length}건 · 제외 ${skipped.length}건</span>
        <div class="scroll-x"><table class="pv"><tr><th>날짜</th><th>구분</th><th>금액</th><th>분류</th><th>가맹점</th></tr>${fresh.slice(0, 8).map((t) => `<tr><td>${t.date}</td><td>${TYPE_LABEL[t.type]}</td><td>${won(t.amount)}</td><td>${esc(t.category)}</td><td>${esc(t.memo)}</td></tr>`).join("")}</table></div>
        ${fresh.length > 8 ? `<div class="hint">외 ${fresh.length - 8}건</div>` : ""}</div>
        <div class="btns"><button class="btn" id="im-cancel">취소</button><button class="btn primary" id="im-ok" ${fresh.length ? "" : "disabled"}>${fresh.length}건 추가</button></div>`);
      $("#im-acc").onchange = (e) => { model.acc = e.target.value; model.sign = ""; draw(); };
      $("#im-sign").onchange = (e) => { model.sign = e.target.value; draw(); };
      $$("[data-m]").forEach((s) => (s.onchange = () => { model.m[s.dataset.m] = +s.value; draw(); }));
      $("#im-cancel").onclick = closeSheet;
      $("#im-ok").onclick = () => {
        commitBatch(fresh, `${accName(model.acc)} · ${fileName}`);
        if (fresh.length) ui.ym = fresh.map((t) => t.date).sort().pop().slice(0, 7);
        ui.fAcc = ""; ui.fType = ""; ui.fCat = ""; ui.q = "";
        save(); closeSheet(); ui.tab = "list"; render(); toast(`${fresh.length}건을 추가했습니다.`);
      };
    };
    draw();
  }

  function importSms() {
    openSheet(`<h3>문자 붙여넣기</h3><div class="hint">카드 승인·입출금 문자를 붙여 넣으세요. 여러 건도 가능합니다. 문자 형식은 카드사마다 달라서 결과를 확인하고 필요하면 고친 뒤 추가하세요.</div>
      <textarea id="sms-text" placeholder="[Web발신]&#10;신한카드(1234)승인 홍*동 12,000원(일시불)10/25 12:30 스타벅스"></textarea>
      <div id="sms-out"></div>
      <div class="btns"><button class="btn" id="sms-cancel">취소</button><button class="btn" id="sms-parse">분석</button><button class="btn primary" id="sms-ok" disabled>추가</button></div>`);
    let items = [];
    $("#sms-cancel").onclick = closeSheet;
    $("#sms-parse").onclick = () => {
      const y = new Date().getFullYear();
      items = L.splitSms($("#sms-text").value).map((raw) => {
        const p = L.parseSms(raw, y, todayStr());
        if (!p) return null;
        const t = { date: p.date, type: p.type, amount: p.amount, memo: p.memo, accountId: guess(raw), category: p.type === "income" ? "기타수입" : "기타" };
        L.applyRules(t, state.rules);
        return { t, raw: p.raw, on: true };
      }).filter(Boolean);
      $("#sms-out").innerHTML = items.length ? items.map((it, i) => `<div class="sms-item"><div class="raw">${esc(it.raw)}</div>
        <label class="check"><input type="checkbox" data-i="${i}" data-k="on" checked> ${it.t.date} · ${TYPE_LABEL[it.t.type]} 추가</label>
        <div class="two"><input data-i="${i}" data-k="memo" value="${esc(it.t.memo)}" aria-label="가맹점"><input data-i="${i}" data-k="amount" inputmode="decimal" value="${it.t.amount}" aria-label="금액">
        <select data-i="${i}" data-k="accountId">${accOptions(it.t.accountId)}</select>
        <select data-i="${i}" data-k="category">${catOptions(it.t.type, it.t.category)}</select></div></div>`).join("")
        : '<div class="empty">금액(○○원)이 있는 문자를 찾지 못했습니다.</div>';
      $("#sms-ok").disabled = !items.length;
    };
    $("#sms-out").onchange = (e) => {
      const el = e.target, it = items[+el.dataset.i]; if (!it) return;
      const k = el.dataset.k;
      if (k === "on") it.on = el.checked;
      else if (k === "amount") it.t.amount = L.parseAmount(el.value);
      else it.t[k] = el.value;
    };
    $("#sms-ok").onclick = () => {
      const picked = items.filter((it) => it.on && isFinite(it.t.amount) && it.t.amount !== 0).map((it) => it.t);
      const fresh = L.filterNew(state.tx, picked);
      if (fresh.length) commitBatch(fresh, `문자 ${fresh.length}건`);
      save(); closeSheet(); ui.tab = "list"; render();
      toast(`${fresh.length}건 추가${picked.length - fresh.length ? `, 이미 있는 ${picked.length - fresh.length}건 제외` : ""}`);
    };
  }

  // ---------- 내보내기·백업 ----------
  // claude.ai 페이지에서는 downloads 기능으로, 일반 브라우저에서는 링크로 저장한다
  let dlApi;
  async function download(name, text, type) {
    if (dlApi === undefined) {
      try { dlApi = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dlApi = null; }
    }
    if (dlApi) {
      try { await dlApi.save({ filename: name, data: text }); return true; }
      catch (e) { if (e && e.code === "declined") return false; toast("파일 저장을 할 수 없습니다. '텍스트 복사'를 사용하세요."); return false; }
    }
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  }
  function exportSheet(title, hint, name, text, type, onDone) {
    openSheet(`<h3>${esc(title)}</h3><div class="hint">${esc(hint)}</div>
      <div class="btns"><button class="btn primary" id="ex-file">파일로 저장</button><button class="btn" id="ex-copy">텍스트 복사</button></div>
      <textarea id="ex-text" readonly>${esc(text)}</textarea>
      <div class="hint">파일 저장이 되지 않는 환경에서는 '텍스트 복사' 후 메모장·메일 등에 붙여 넣어 보관하세요.</div>
      <div class="btns"><button class="btn" id="ex-close">닫기</button></div>`);
    $("#ex-file").onclick = async () => { if (await download(name, text, type)) { if (onDone) onDone(); toast("파일을 저장했습니다."); } };
    $("#ex-copy").onclick = () => {
      const done = () => { if (onDone) onDone(); toast("복사했습니다."); };
      const fallback = () => { const ta = $("#ex-text"); ta.focus(); ta.select(); toast("텍스트를 선택했습니다. 길게 눌러 복사하세요."); };
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    };
    $("#ex-close").onclick = () => { closeSheet(); render(); };
  }
  function exportBackup() {
    exportSheet("백업", `내역 ${state.tx.length}건, 투자 ${state.trades.length}건, 대출 ${state.loans.length}건, 순자산 ${Object.keys(state.nw.months).length}개월을 백업합니다.`, `ledger-backup-${todayStr()}.json`, JSON.stringify(state), "application/json",
      () => { state.settings.lastBackup = new Date().toISOString(); save(); });
  }
  function exportCsv() {
    // 엑셀에서 수식으로 실행되지 않도록 = + - @ 로 시작하는 문자열 앞에 ' 를 붙인다
    const cell = (v) => { let s = String(v == null ? "" : v); if (/^[=+\-@]/.test(s) && typeof v === "string") s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = [["날짜", "구분", "금액", "카드·계좌", "분류", "가맹점·메모"]];
    [...state.tx].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((t) => rows.push([t.date, TYPE_LABEL[t.type], t.amount, accName(t.accountId), t.category, t.memo]));
    const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
    exportSheet("내역 CSV", "엑셀에서 열 수 있는 CSV입니다.", `ledger-${todayStr()}.csv`, "\uFEFF" + csv, "text/csv");
  }
  function restoreSheet() {
    openSheet(`<h3>백업 불러오기</h3><div class="hint">백업 파일을 고르거나, 복사해 둔 백업 텍스트를 붙여 넣으세요.</div>
      <div class="btns"><button class="btn" id="rs-file">백업 파일 고르기</button></div>
      <textarea id="rs-text" placeholder="백업 텍스트 붙여넣기"></textarea>
      <div class="btns"><button class="btn" id="rs-cancel">취소</button><button class="btn primary" id="rs-ok">불러오기</button></div>`);
    $("#rs-file").onclick = () => $("#restore-file") ? $("#restore-file").click() : null;
    $("#rs-cancel").onclick = closeSheet;
    $("#rs-ok").onclick = () => restoreBackup($("#rs-text").value);
  }
  async function restoreBackup(text) {
    try {
      const s = JSON.parse(text);
      if (!Array.isArray(s.tx) || !Array.isArray(s.accounts) || !Array.isArray(s.trades)) throw new Error("형식 오류");
      if (!(await ask(`현재 데이터를 지우고 백업(내역 ${s.tx.length}건, 투자 ${s.trades.length}건)으로 교체할까요?`, "교체"))) return;
      state = normalize(s);
      state.settings.lastBackup = new Date().toISOString(); // 방금 복원한 내용은 백업본에 이미 있음
      save(); render(); toast("복원했습니다.");
    } catch (e) { toast("백업 파일을 읽지 못했습니다."); }
  }

  // ---------- 이벤트 ----------
  function shiftMonth(d) {
    let [y, m] = ui.ym.split("-").map(Number);
    m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    ui.ym = `${y}-${pad(m)}`;
  }
  const goList = (patch) => { Object.assign(ui, { fAcc: "", fType: "", fCat: "", q: "" }, patch); ui.tab = "list"; render(); };

  document.addEventListener("click", async (e) => {
    const T = e.target;
    const tab = T.closest("#tabs button");
    if (tab) { ui.tab = tab.dataset.tab; return render(); }
    if (T.id === "overlay") return closeSheet();
    if (T.id === "fab") return ui.tab === "invest" ? tradeForm() : ui.tab === "asset" ? (ui.asub === "loan" ? loanForm() : goalForm()) : txForm();
    const pick = (sel) => T.closest(sel);
    let el;
    if ((el = pick("[data-edit]"))) return txForm(state.tx.find((t) => t.id === el.dataset.edit));
    if ((el = pick("[data-edit-trade]"))) return tradeForm(state.trades.find((t) => t.id === el.dataset.editTrade));
    if ((el = pick("[data-gocat]"))) return goList({ fCat: el.dataset.gocat, fType: "expense" });
    if ((el = pick("[data-goacc]"))) return goList({ fAcc: el.dataset.goacc });
    if ((el = pick("[data-acc]"))) return accountForm(acc(el.dataset.acc));
    if ((el = pick("[data-asub]"))) { ui.asub = el.dataset.asub; return render(); }
    if ((el = pick("[data-nwitem]"))) return nwItemForm(state.nw.items.find((x) => x.id === el.dataset.nwitem));
    if ((el = pick("[data-loan]"))) return loanForm(loanOf(el.dataset.loan));
    if ((el = pick("[data-loanrec-new]"))) return loanRecForm(loanOf(el.dataset.loanrecNew));
    if ((el = pick("[data-loanrec]"))) { const r = state.loanRecs.find((x) => x.id === el.dataset.loanrec); return loanRecForm(loanOf(r.loanId), r); }
    if ((el = pick("[data-sim]"))) return simSheet(loanOf(el.dataset.sim));
    if ((el = pick("[data-goal]"))) return goalForm(state.goals.find((x) => x.id === el.dataset.goal));
    if ((el = pick("[data-cat-edit]"))) { const [type, ...rest] = el.dataset.catEdit.split("|"); return catForm(type, rest.join("|")); }
    if ((el = pick("[data-del-rule]"))) { state.rules.splice(+el.dataset.delRule, 1); save(); return render(); }
    if ((el = pick("[data-undo]"))) {
      const b = state.batches.find((x) => x.id === el.dataset.undo);
      const n = state.tx.filter((t) => t.batch === b.id).length;
      if (!(await ask(`'${b.label}'로 가져온 내역 ${n}건을 삭제할까요?`, "삭제"))) return;
      state.tx = state.tx.filter((t) => t.batch !== b.id);
      state.batches = state.batches.filter((x) => x.id !== b.id);
      save(); render(); return toast(`${n}건을 삭제했습니다.`);
    }
    if ((el = pick("[data-add-cat]"))) {
      const type = el.dataset.addCat;
      const n = (await askText(`새 ${TYPE_LABEL[type]} 분류`, "예: 반려동물")) || "";
      if (!n) return;
      if (allCats(type).includes(n)) return toast("같은 이름의 분류가 이미 있습니다.");
      state.categories[type].push(n); save(); render();
      return GROUPS[type] ? catForm(type, n) : null; // 그룹·예산을 바로 정할 수 있게 수정 화면을 연다
    }
    if ((el = pick("[data-del-cat]"))) {
      const [type, name] = el.dataset.delCat.split("|");
      if (state.tx.some((t) => t.type === type && t.category === name)) return toast("사용 중인 분류는 삭제할 수 없습니다.");
      state.categories[type] = state.categories[type].filter((c) => c !== name);
      if (state.catMeta[type]) delete state.catMeta[type][name];
      save(); return render();
    }
    if (!(el = pick("[data-act]"))) return;
    switch (el.dataset.act) {
      case "cmp-all": ui.cmpAll = !ui.cmpAll; return render();
      case "nw-add": return nwItemForm();
      case "nw-copy": {
        const k = nwMonths().filter((x) => x < ui.ym).pop();
        if (!k) return toast("이전 달 기록이 없습니다.");
        state.nw.months[ui.ym] = { ...state.nw.months[k], ...Object.fromEntries(Object.entries(state.nw.months[ui.ym] || {}).filter(([, v]) => +v)) };
        save(); render(); return toast(`${+k.slice(5)}월 값을 빈 칸에 복사했습니다.`);
      }
      case "nw-auto": {
        const m = (state.nw.months[ui.ym] = state.nw.months[ui.ym] || {});
        const h = L.computeHoldings(state.trades, state.prices);
        const done = [];
        state.nw.items.filter((x) => x.auto === "invest").forEach((x) => { m[x.id] = Math.round(h.totalValue); done.push(x.name); });
        const debt = {};
        state.loans.filter((l) => l.nwItem).forEach((l) => { debt[l.nwItem] = (debt[l.nwItem] || 0) + L.loanBalanceAt(l, state.loanRecs, ui.ym); });
        Object.entries(debt).forEach(([id, v]) => { m[id] = Math.round(v); done.push((state.nw.items.find((x) => x.id === id) || {}).name); });
        save(); render();
        return toast(done.length ? `${done.join(", ")}을(를) 채웠습니다.` : "연결된 항목이 없습니다. 항목·대출 수정에서 연결하세요.");
      }
      case "prev": shiftMonth(-1); return render();
      case "next": shiftMonth(1); return render();
      case "import-file": return $("#file").click();
      case "import-sms": return importSms();
      case "add-acc": return accountForm();
      case "add-rule": return ruleForm();
      case "export": return exportBackup();
      case "export-csv": return exportCsv();
      case "restore": return restoreSheet();
      case "wipe":
        if (await ask("모든 내역, 투자·대출·순자산·목표 기록을 삭제합니다. 되돌릴 수 없습니다. 먼저 백업해 두는 것을 권장합니다.", "모두 삭제")) {
          state = DEFAULT_STATE(); save(); render(); toast("삭제했습니다.");
        }
    }
  });

  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.f && t.dataset.f !== "q") { ui[t.dataset.f] = t.value; return render(); }
    if (t.dataset.price !== undefined) {
      const v = L.parseAmount(t.value);
      if (isFinite(v) && v > 0) state.prices[t.dataset.price] = v; else delete state.prices[t.dataset.price];
      save(); return render();
    }
    if (t.dataset.nw !== undefined) {
      const v = t.value.trim() ? L.parseAmount(t.value) : 0;
      if (!isFinite(v) || v < 0) { t.value = ""; return toast("금액을 확인하세요."); }
      const m = (state.nw.months[ui.ym] = state.nw.months[ui.ym] || {});
      if (v) m[t.dataset.nw] = v; else delete m[t.dataset.nw];
      t.value = v ? v.toLocaleString("ko-KR") : "";
      save();
      // 입력 중인 다음 칸의 포커스가 사라지지 않도록 합계만 다시 그린다
      return ($("#nw-sum").innerHTML = nwSum());
    }
    if (t.id === "budget") {
      const v = L.parseAmount(t.value);
      state.settings.budget = isFinite(v) && v > 0 ? v : 0;
      save(); render(); return toast(state.settings.budget ? "예산을 저장했습니다." : "예산을 사용하지 않습니다.");
    }
    if (t.id === "file" && t.files[0]) {
      const f = t.files[0]; t.value = "";
      try {
        const rows = await readFileRows(f);
        if (!rows.length) return toast("파일에서 내용을 찾지 못했습니다.");
        importSheet(rows, f.name);
      } catch (err) { toast(err.message || "파일을 읽지 못했습니다."); }
    }
    if (t.id === "restore-file" && t.files[0]) { const f = t.files[0]; t.value = ""; restoreBackup(await f.text()); }
  });
  // 검색은 결과 영역만 다시 그린다(입력창을 다시 만들면 한글 조합이 끊김)
  document.addEventListener("input", (e) => {
    if (e.target.dataset.f === "q") { ui.q = e.target.value; $("#list-body").innerHTML = listBody(); }
  });

  load();
  showBanner();
  render();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
