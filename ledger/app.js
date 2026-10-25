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
  const TYPE_LABEL = { expense: "지출", income: "수입", transfer: "이체" };

  const DEFAULT_STATE = () => ({
    version: 2,
    accounts: [
      { id: "shinhan", name: "신한카드", kind: "card", last4: "" },
      { id: "kdb-check", name: "산업은행 체크카드", kind: "check", last4: "" },
      { id: "ulsan-pay", name: "울산페이카드", kind: "prepaid", last4: "" },
      { id: "cash", name: "현금", kind: "cash", last4: "" },
      { id: "broker", name: "증권계좌", kind: "broker", last4: "" },
    ],
    categories: {
      expense: ["식비", "카페", "편의점·마트", "교통", "주거·통신", "의료", "쇼핑", "문화·여가", "교육", "경조사", "보험", "기타"],
      income: ["급여", "이자·배당", "환급", "기타수입"],
      transfer: ["이체", "카드대금", "투자이체"],
    },
    rules: [
      { kw: "카드대금", toType: "transfer", category: "카드대금" },
      { kw: "카드결제", toType: "transfer", category: "카드대금" },
      { kw: "증권", toType: "transfer", category: "투자이체" },
      { kw: "스타벅스", category: "카페" }, { kw: "커피", category: "카페" }, { kw: "카페", category: "카페" },
      { kw: "이디야", category: "카페" }, { kw: "메가MGC", category: "카페" }, { kw: "투썸", category: "카페" },
      { kw: "GS25", category: "편의점·마트" }, { kw: "세븐일레븐", category: "편의점·마트" },
      { kw: "이마트", category: "편의점·마트" }, { kw: "홈플러스", category: "편의점·마트" }, { kw: "롯데마트", category: "편의점·마트" },
      { kw: "택시", category: "교통" }, { kw: "버스", category: "교통" }, { kw: "지하철", category: "교통" }, { kw: "코레일", category: "교통" },
      { kw: "주유", category: "교통" }, { kw: "티머니", category: "교통" },
      { kw: "쿠팡", category: "쇼핑" }, { kw: "11번가", category: "쇼핑" }, { kw: "G마켓", category: "쇼핑" },
      { kw: "병원", category: "의료" }, { kw: "약국", category: "의료" }, { kw: "의원", category: "의료" },
      { kw: "통신", category: "주거·통신" }, { kw: "SKT", category: "주거·통신" }, { kw: "관리비", category: "주거·통신" },
      { kw: "급여", category: "급여", type: "income" }, { kw: "월급", category: "급여", type: "income" },
      { kw: "이자", category: "이자·배당", type: "income" }, { kw: "배당", category: "이자·배당", type: "income" },
    ],
    tx: [],
    trades: [],
    prices: {},
    batches: [], // 가져오기 기록 [{id, at, label, count}]
    settings: { budget: 0, lastBackup: null },
  });

  let state = DEFAULT_STATE();
  let storageOk = true;
  const ui = { tab: "home", ym: todayStr().slice(0, 7), fAcc: "", fType: "", fCat: "", q: "" };

  function normalize(s) {
    const d = DEFAULT_STATE();
    const n = Object.assign(d, s);
    n.categories = Object.assign(DEFAULT_STATE().categories, s.categories || {});
    n.settings = Object.assign(DEFAULT_STATE().settings, s.settings || {});
    n.batches = Array.isArray(s.batches) ? s.batches : [];
    n.accounts = n.accounts.map((a) => ({ last4: "", ...a }));
    n.version = 2;
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
  const catOptions = (type, sel) => allCats(type).map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("");
  const defaultAcc = () => (state.accounts.find((a) => a.kind === "card" || a.kind === "check") || state.accounts[0]).id;
  const guess = (text) => L.guessAccount(text, state.accounts) || defaultAcc();

  // ---------- 화면 ----------
  function render() {
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.tab));
    $("#fab").hidden = ui.tab === "more";
    renderTop();
    $("#view").innerHTML = { home: viewHome, list: viewList, invest: viewInvest, more: viewMore }[ui.tab]();
  }

  function renderTop() {
    const t = $("#top");
    if (ui.tab === "more" || ui.tab === "invest") { t.innerHTML = `<h1>${ui.tab === "more" ? "설정" : "투자"}</h1>`; return; }
    const [y, m] = ui.ym.split("-");
    t.innerHTML = `<h1>${ui.tab === "home" ? "내 가계부" : "내역"}</h1>
      <div class="month"><button data-act="prev" aria-label="이전 달">‹</button><span>${y}년 ${+m}월</span><button data-act="next" aria-label="다음 달">›</button></div>`;
  }

  // 비율은 순지출이 양수인 항목끼리의 합 기준(환불로 음수가 된 항목은 막대 없이 금액만 표시)
  function bars(arr, attr) {
    if (!arr.length) return '<div class="empty">이번 달 지출 내역이 없습니다.</div>';
    const base = arr.reduce((s, x) => s + (x.v > 0 ? x.v : 0), 0);
    return arr.map((x) => `<div class="bar-row tap" ${attr}="${esc(x.key)}"><div class="meta"><span>${esc(x.label)}</span><span>${won(x.v)} <span class="sub">${x.v > 0 && base > 0 ? Math.round((x.v / base) * 100) + "%" : ""}</span></span></div><div class="bar"><i style="width:${x.v > 0 && base > 0 ? (x.v / base) * 100 : 0}%"></i></div></div>`).join("");
  }

  function viewHome() {
    const s = L.summarize(state.tx, ui.ym);
    const net = s.income - s.expense;
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, v }));
    const accs = Object.entries(s.byAcc).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ key: id, label: accName(id), v }));
    const h = L.computeHoldings(state.trades, state.prices);
    const budget = state.settings.budget;
    const trend = L.monthlyTrend(state.tx, ui.ym, 6);
    const maxT = Math.max(1, ...trend.map((t) => t.expense));
    let html = "";
    const lb = state.settings.lastBackup;
    if (state.tx.length && (!lb || daysSince(lb) >= 30)) {
      html += `<div class="card warn">${lb ? `마지막 백업이 ${daysSince(lb)}일 전입니다.` : "아직 백업한 적이 없습니다."} 데이터는 이 브라우저에만 있으니 백업 파일을 저장해 두세요. <button class="btn" data-act="export" style="margin-top:8px">지금 백업</button></div>`;
    }
    html += `<div class="card"><div class="grid">
        <div class="stat"><div class="label">수입</div><div class="value inc">${won(s.income)}</div></div>
        <div class="stat"><div class="label">지출</div><div class="value exp">${won(s.expense)}</div></div>
        <div class="stat"><div class="label">수입 - 지출</div><div class="value ${net < 0 ? "exp" : ""}">${won(net)}</div></div>
        <div class="stat"><div class="label">투자 평가손익</div><div class="value inv">${h.list.some((x) => x.qty > 0) ? won(h.totalUnrealized) : "-"}</div></div>
      </div>`;
    if (budget > 0) {
      const used = s.expense / budget;
      html += `<div class="bar-row" style="margin-top:14px"><div class="meta"><span>예산 ${won(budget)}</span><span class="${used > 1 ? "exp" : "sub"}">${used > 1 ? won(s.expense - budget) + " 초과" : won(budget - s.expense) + " 남음"}</span></div>
        <div class="bar"><i style="width:${Math.min(100, Math.max(0, used * 100))}%;${used > 1 ? "background:var(--exp)" : ""}"></i></div></div>`;
    }
    html += `<div class="hint">이체(카드대금, 투자이체 등)는 수입·지출에 포함하지 않습니다.</div></div>
      <div class="card"><h2>카테고리별 지출 <span class="sub">· 누르면 내역</span></h2>${bars(cats, "data-gocat")}</div>
      <div class="card"><h2>카드·계좌별 지출 <span class="sub">· 누르면 내역</span></h2>${bars(accs, "data-goacc")}</div>
      <div class="card"><h2>최근 6개월 지출</h2>${trend.map((t) => `<div class="bar-row"><div class="meta"><span>${+t.ym.slice(5)}월</span><span>${won(t.expense)}</span></div><div class="bar"><i style="width:${Math.max(0, (t.expense / maxT) * 100)}%;${t.ym === ui.ym ? "" : "opacity:.5"}"></i></div></div>`).join("")}</div>`;
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
    let html = `<div class="day"><span>${list.length}건</span><span>수입 ${won(inc)} · 지출 ${won(exp)}</span></div>`;
    const byDay = {};
    list.forEach((t) => (byDay[t.date] = byDay[t.date] || []).push(t));
    for (const d of Object.keys(byDay).sort().reverse()) {
      const dayExp = byDay[d].filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      const wd = "일월화수목금토"[new Date(d + "T00:00:00").getDay()];
      html += `<div class="day"><span>${+d.slice(5, 7)}월 ${+d.slice(8)}일 (${wd})</span><span>${dayExp ? "지출 " + won(dayExp) : ""}</span></div><div>`;
      html += byDay[d].map((t) => `<div class="row" data-edit="${t.id}"><div class="l"><div class="t">${esc(t.memo || t.category)}</div><div class="s">${esc(t.category)} · ${esc(accName(t.accountId))}${t.type === "transfer" ? '<span class="chip">이체</span>' : ""}</div></div>
        <div class="r ${t.type === "income" ? "inc" : t.type === "expense" ? "exp" : "sub"}">${t.type === "income" ? "+" : t.type === "expense" ? (t.amount < 0 ? "+" : "-") : ""}${won(Math.abs(t.amount))}</div></div>`).join("");
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

  function viewMore() {
    const cnt = (id) => state.tx.filter((t) => t.accountId === id).length;
    const lb = state.settings.lastBackup;
    const catBlock = (type) => `<div style="margin-top:10px"><b style="font-size:13px">${TYPE_LABEL[type]}</b><div class="chips">${state.categories[type].map((c) => `<span class="chip lg">${esc(c)} <button data-del-cat="${type}|${esc(c)}" aria-label="${esc(c)} 삭제">×</button></span>`).join("")}<button class="chip lg add" data-add-cat="${type}">+ 추가</button></div></div>`;
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
      <div class="card"><h2>월 예산</h2>
        <input id="budget" inputmode="numeric" placeholder="예: 1,500,000 (0이면 사용 안 함)" value="${state.settings.budget ? state.settings.budget.toLocaleString("ko-KR") : ""}">
        <div class="hint">이체를 제외한 지출 합계와 비교합니다.</div></div>
      <div class="card"><h2>분류</h2>${catBlock("expense")}${catBlock("income")}${catBlock("transfer")}
        <div class="hint">사용 중인 분류는 삭제할 수 없습니다.</div></div>
      <div class="card"><h2>자동 분류 규칙</h2>
        <div class="hint" style="margin:0 0 8px">가맹점·적요에 키워드가 들어 있으면 분류를 자동 지정합니다. 위쪽 규칙이 먼저 적용됩니다.</div>
        ${state.rules.map((r, i) => `<div class="meta bar-row"><span>${esc(r.kw)} → ${esc(r.category)}${r.toType ? ` <span class="chip">이체</span>` : r.type ? ` <span class="chip">${TYPE_LABEL[r.type]}만</span>` : ""}</span><button class="btn danger sm" data-del-rule="${i}">삭제</button></div>`).join("")}
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
      <label class="f">금액 (환불은 음수)</label><input id="tx-amount" inputmode="decimal" placeholder="0" value="${t.amount}">
      <label class="f">카드·계좌</label><select id="tx-acc">${accOptions(t.accountId)}</select>
      <label class="f">분류</label><select id="tx-cat">${catOptions(t.type, t.category)}</select>
      <label class="f">가맹점·메모</label><input id="tx-memo" value="${esc(t.memo)}">
      <label class="check"><input type="checkbox" id="tx-rule"> 같은 가맹점은 앞으로 이 분류로 자동 분류</label>
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
        const n = addRule({ kw: memo, category: next.category, ...(type === "transfer" ? { toType: "transfer" } : type === "income" ? { type: "income" } : {}) });
        msg = `저장하고 규칙을 추가했습니다${n ? ` (기존 ${n}건에도 적용)` : ""}.`;
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
      <label class="f">적용 대상</label>${segHtml("ru-type", [["expense", "지출"], ["income", "수입"], ["transfer", "이체로 바꾸기"]], "expense")}
      <label class="f">분류</label><select id="ru-cat">${catOptions("expense", "")}</select>
      <div class="hint">'이체로 바꾸기'는 카드대금·내 계좌 간 이동처럼 수입·지출에서 빼야 하는 거래에 씁니다. 추가하면 아직 '기타'인 기존 내역에도 적용합니다.</div>
      <div class="btns"><button class="btn" id="ru-cancel">취소</button><button class="btn primary" id="ru-save">추가</button></div>`);
    let type = "expense";
    bindSeg("ru-type", (v) => { type = v; $("#ru-cat").innerHTML = catOptions(v, ""); });
    $("#ru-cancel").onclick = closeSheet;
    $("#ru-save").onclick = () => {
      const kw = $("#ru-kw").value.trim();
      if (!kw) return toast("키워드를 입력하세요.");
      const category = $("#ru-cat").value;
      // 지출 규칙은 type 없이 저장해 카드 환불·은행 출금에도 적용되게 한다(수입에는 applyRules가 적용하지 않음)
      const n = addRule({ kw, category, ...(type === "transfer" ? { toType: "transfer" } : type === "income" ? { type: "income" } : {}) });
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
    exportSheet("백업", `내역 ${state.tx.length}건, 투자 기록 ${state.trades.length}건을 백업합니다.`, `ledger-backup-${todayStr()}.json`, JSON.stringify(state), "application/json",
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
    if (T.id === "fab") return ui.tab === "invest" ? tradeForm() : txForm();
    const pick = (sel) => T.closest(sel);
    let el;
    if ((el = pick("[data-edit]"))) return txForm(state.tx.find((t) => t.id === el.dataset.edit));
    if ((el = pick("[data-edit-trade]"))) return tradeForm(state.trades.find((t) => t.id === el.dataset.editTrade));
    if ((el = pick("[data-gocat]"))) return goList({ fCat: el.dataset.gocat, fType: "expense" });
    if ((el = pick("[data-goacc]"))) return goList({ fAcc: el.dataset.goacc });
    if ((el = pick("[data-acc]"))) return accountForm(acc(el.dataset.acc));
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
      if (n && !state.categories[type].includes(n)) { state.categories[type].push(n); save(); render(); }
      return;
    }
    if ((el = pick("[data-del-cat]"))) {
      const [type, name] = el.dataset.delCat.split("|");
      if (state.tx.some((t) => t.type === type && t.category === name)) return toast("사용 중인 분류는 삭제할 수 없습니다.");
      state.categories[type] = state.categories[type].filter((c) => c !== name);
      save(); return render();
    }
    if (!(el = pick("[data-act]"))) return;
    switch (el.dataset.act) {
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
        if (await ask("모든 내역과 투자 기록을 삭제합니다. 되돌릴 수 없습니다. 먼저 백업해 두는 것을 권장합니다.", "모두 삭제")) {
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
