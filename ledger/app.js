(function () {
  "use strict";
  const L = window.Logic;
  const KEY = "ledger.v1";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const won = (n) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("ko-KR") + "원";
  const pct = (r) => (r == null ? "-" : (r >= 0 ? "+" : "") + (r * 100).toFixed(2) + "%");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  const DEFAULT_STATE = () => ({
    version: 1,
    accounts: [
      { id: "shinhan", name: "신한카드", kind: "card" },
      { id: "kdb-check", name: "산업은행 체크카드", kind: "check" },
      { id: "ulsan-pay", name: "울산페이카드", kind: "check" },
      { id: "cash", name: "현금", kind: "cash" },
      { id: "broker", name: "증권계좌", kind: "broker" },
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
  });

  let state = DEFAULT_STATE();
  let storageOk = true;
  const ui = { tab: "home", ym: todayStr().slice(0, 7), fAcc: "", fType: "", q: "" };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        state = Object.assign(DEFAULT_STATE(), s);
        state.categories = Object.assign(DEFAULT_STATE().categories, s.categories || {});
      }
    } catch (e) { storageOk = false; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { storageOk = false; showBanner(); }
  }
  function showBanner() {
    const b = $("#banner");
    if (!storageOk) {
      b.hidden = false;
      b.textContent = "이 브라우저에서는 저장이 막혀 있어 새로고침하면 데이터가 사라집니다. 사생활 보호 모드를 끄거나 설정 > 백업으로 파일을 저장하세요.";
    } else b.hidden = true;
  }
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2200);
  }

  const accName = (id) => (state.accounts.find((a) => a.id === id) || { name: "(삭제된 계정)" }).name;
  const allCats = (type) => {
    const base = state.categories[type] || [];
    const used = state.tx.filter((t) => t.type === type).map((t) => t.category);
    return [...new Set([...base, ...used])];
  };
  const TYPE_LABEL = { expense: "지출", income: "수입", transfer: "이체" };

  // ---------- 화면 ----------
  function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.tab));
    $("#fab").hidden = ui.tab === "more";
    renderTop();
    const v = $("#view");
    v.innerHTML = { home: viewHome, list: viewList, invest: viewInvest, more: viewMore }[ui.tab]();
  }

  function renderTop() {
    const t = $("#top");
    if (ui.tab === "more") { t.innerHTML = "<h1>설정</h1>"; return; }
    if (ui.tab === "invest") { t.innerHTML = "<h1>투자</h1>"; return; }
    const [y, m] = ui.ym.split("-");
    t.innerHTML = `<h1>${ui.tab === "home" ? "내 가계부" : "내역"}</h1>
      <div class="month"><button data-act="prev" aria-label="이전 달">‹</button><span>${y}년 ${+m}월</span><button data-act="next" aria-label="다음 달">›</button></div>`;
  }

  function viewHome() {
    const s = L.summarize(state.tx, ui.ym);
    const net = s.income - s.expense;
    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const accs = Object.entries(s.byAcc).sort((a, b) => b[1] - a[1]);
    const h = L.computeHoldings(state.trades, state.prices);
    // 비율은 순지출이 양수인 항목끼리의 합 기준이다(환불로 음수가 된 항목은 막대 없이 금액만 표시)
    const bars = (arr) => {
      const base = arr.reduce((s, [, v]) => s + (v > 0 ? v : 0), 0);
      return arr.length
        ? arr.map(([k, v]) => `<div class="bar-row"><div class="meta"><span>${esc(k)}</span><span>${won(v)} <span class="sub">${v > 0 && base > 0 ? Math.round((v / base) * 100) + "%" : ""}</span></span></div><div class="bar"><i style="width:${v > 0 && base > 0 ? (v / base) * 100 : 0}%"></i></div></div>`).join("")
        : '<div class="empty">이번 달 지출 내역이 없습니다.</div>';
    };
    return `
      <div class="card"><div class="grid">
        <div class="stat"><div class="label">수입</div><div class="value inc">${won(s.income)}</div></div>
        <div class="stat"><div class="label">지출</div><div class="value exp">${won(s.expense)}</div></div>
        <div class="stat"><div class="label">수입 - 지출</div><div class="value ${net < 0 ? "exp" : ""}">${won(net)}</div></div>
        <div class="stat"><div class="label">투자 평가손익</div><div class="value inv">${h.list.length ? won(h.totalUnrealized) : "-"}</div></div>
      </div><div class="hint">이체(카드대금, 투자이체 등)는 수입·지출에 포함하지 않습니다.</div></div>
      <div class="card"><h2>카테고리별 지출</h2>${bars(cats)}</div>
      <div class="card"><h2>카드·계좌별 지출</h2>${bars(accs.map(([id, v]) => [accName(id), v]))}</div>`;
  }

  function filteredTx() {
    const q = ui.q.trim().toLowerCase();
    return state.tx.filter((t) => t.date.slice(0, 7) === ui.ym
      && (!ui.fAcc || t.accountId === ui.fAcc)
      && (!ui.fType || t.type === ui.fType)
      && (!q || (t.memo + t.category).toLowerCase().includes(q)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function viewList() {
    const list = filteredTx();
    let html = `<div class="filters">
      <select data-f="fAcc"><option value="">전체 계정</option>${state.accounts.map((a) => `<option value="${a.id}" ${ui.fAcc === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
      <select data-f="fType"><option value="">전체</option>${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${ui.fType === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    </div><div class="filters"><input data-f="q" type="search" placeholder="가맹점·분류 검색" value="${esc(ui.q)}"></div>`;
    if (!list.length) return html + '<div class="empty">내역이 없습니다. 오른쪽 아래 + 버튼으로 추가하세요.</div>';
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
    return `
      <div class="card"><h2>내역 가져오기</h2>
        <div class="btns" style="margin-top:0"><button class="btn primary" data-act="import-file">CSV·엑셀 업로드</button><button class="btn" data-act="import-sms">문자 붙여넣기</button></div>
        <div class="hint">카드사·은행 앱에서 받은 이용내역 파일을 올리면 열을 자동으로 찾습니다. 같은 날짜·금액·가맹점은 중복으로 보고 건너뜁니다.</div>
        <input id="file" type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" hidden></div>
      <div class="card"><h2>카드·계좌</h2>
        ${state.accounts.map((a) => `<div class="bar-row"><div class="meta"><span>${esc(a.name)} <span class="chip">${{ card: "신용카드", check: "체크카드", bank: "은행", cash: "현금", broker: "증권" }[a.kind]}</span></span><span><button class="btn" style="width:auto;padding:4px 10px" data-ren="${a.id}">이름</button> <button class="btn danger" style="width:auto;padding:4px 10px" data-del-acc="${a.id}">삭제</button></span></div></div>`).join("")}
        <div class="btns"><button class="btn" data-act="add-acc">+ 계정 추가 (은행 등)</button></div></div>
      <div class="card"><h2>자동 분류 규칙</h2>
        <div class="hint" style="margin:0 0 8px">가맹점·적요에 키워드가 들어 있으면 분류를 자동 지정합니다. 위쪽 규칙이 먼저 적용됩니다.</div>
        ${state.rules.map((r, i) => `<div class="meta bar-row"><span>${esc(r.kw)} → ${esc(r.category)}${r.toType ? ` <span class="chip">${TYPE_LABEL[r.toType]}</span>` : ""}</span><button class="btn danger" style="width:auto;padding:2px 10px" data-del-rule="${i}">삭제</button></div>`).join("")}
        <div class="btns"><button class="btn" data-act="add-rule">+ 규칙 추가</button></div></div>
      <div class="card"><h2>백업</h2>
        <div class="hint" style="margin:0 0 8px">데이터는 이 브라우저 안에만 저장됩니다. 브라우저 데이터를 지우거나 기기를 바꾸면 사라지므로 주기적으로 파일로 백업하세요.</div>
        <div class="btns" style="margin-top:0"><button class="btn primary" data-act="export">백업 파일 저장</button><button class="btn" data-act="restore">백업 불러오기</button></div>
        <input id="restore-file" type="file" accept=".json,application/json" hidden>
        <div class="btns"><button class="btn danger" data-act="wipe">모든 데이터 삭제</button></div>
        <div class="hint">저장된 내역 ${state.tx.length}건, 투자 기록 ${state.trades.length}건</div></div>`;
  }

  // ---------- 시트(모달) ----------
  function openSheet(html) { $("#sheet").innerHTML = html; $("#overlay").hidden = false; }
  function closeSheet() { $("#overlay").hidden = true; $("#sheet").innerHTML = ""; }

  function txForm(t) {
    const isNew = !t;
    t = t || { id: uid(), type: "expense", date: todayStr(), amount: "", accountId: state.accounts[0].id, category: "", memo: "" };
    const cats = (type) => allCats(type).map((c) => `<option ${c === t.category ? "selected" : ""}>${esc(c)}</option>`).join("");
    openSheet(`<h3>${isNew ? "내역 추가" : "내역 수정"}</h3>
      <label class="f">구분</label><div class="seg" id="tx-type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<button type="button" data-v="${k}" class="${t.type === k ? "on" : ""}">${v}</button>`).join("")}</div>
      <label class="f">날짜</label><input id="tx-date" type="date" value="${t.date}">
      <label class="f">금액 (환불은 음수)</label><input id="tx-amount" inputmode="decimal" placeholder="0" value="${t.amount}">
      <label class="f">카드·계좌</label><select id="tx-acc">${state.accounts.map((a) => `<option value="${a.id}" ${a.id === t.accountId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
      <label class="f">분류</label><select id="tx-cat">${cats(t.type)}</select>
      <label class="f">가맹점·메모</label><input id="tx-memo" value="${esc(t.memo)}">
      <div class="btns">${isNew ? "" : '<button class="btn danger" id="tx-del">삭제</button>'}<button class="btn" id="tx-cancel">취소</button><button class="btn primary" id="tx-save">저장</button></div>`);
    let type = t.type;
    const setCats = () => {
      const keep = $("#tx-cat").value;
      const cs = allCats(type);
      $("#tx-cat").innerHTML = cs.map((c) => `<option ${c === keep ? "selected" : ""}>${esc(c)}</option>`).join("");
    };
    if (!t.category) setCats();
    $("#tx-type").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      type = b.dataset.v;
      document.querySelectorAll("#tx-type button").forEach((x) => x.classList.toggle("on", x === b));
      $("#tx-cat").innerHTML = ""; setCats();
    };
    $("#tx-cancel").onclick = closeSheet;
    if (!isNew) $("#tx-del").onclick = () => { state.tx = state.tx.filter((x) => x.id !== t.id); save(); closeSheet(); render(); toast("삭제했습니다."); };
    $("#tx-save").onclick = () => {
      const amount = L.parseAmount($("#tx-amount").value);
      const date = L.normDate($("#tx-date").value);
      if (!isFinite(amount) || amount === 0) return toast("금액을 확인하세요.");
      if (!date) return toast("날짜를 확인하세요.");
      const next = { id: t.id, type, date, amount: type === "expense" ? amount : Math.abs(amount), accountId: $("#tx-acc").value, category: $("#tx-cat").value || "기타", memo: $("#tx-memo").value.trim() };
      const i = state.tx.findIndex((x) => x.id === t.id);
      if (i >= 0) state.tx[i] = next; else state.tx.push(next);
      ui.ym = date.slice(0, 7);
      save(); closeSheet(); render(); toast("저장했습니다.");
    };
  }

  function tradeForm(t) {
    const isNew = !t;
    t = t || { id: uid(), side: "buy", date: todayStr(), symbol: "", name: "", qty: "", price: "", fee: "" };
    const syms = [...new Map(state.trades.map((x) => [x.symbol, x.name])).entries()];
    openSheet(`<h3>${isNew ? "매매·배당 기록" : "기록 수정"}</h3>
      <label class="f">구분</label><div class="seg" id="tr-side">${[["buy", "매수"], ["sell", "매도"], ["dividend", "배당"]].map(([k, v]) => `<button type="button" data-v="${k}" class="${t.side === k ? "on" : ""}">${v}</button>`).join("")}</div>
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
      document.querySelectorAll("#tr-side button").forEach((b) => b.classList.toggle("on", b.dataset.v === side));
    };
    sync();
    $("#tr-side").onclick = (e) => { const b = e.target.closest("button"); if (b) { side = b.dataset.v; sync(); } };
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

  // ---------- 파일 가져오기 ----------
  function decodeText(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("euc-kr").decode(buf); } // 국내 카드사·은행 CSV는 EUC-KR인 경우가 많음
  }
  function loadSheetJS() {
    return new Promise((res, rej) => {
      if (window.XLSX) return res(window.XLSX);
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error("엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하거나 CSV로 저장해서 올려 주세요."));
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

  function guessAccount(text) {
    const t = text.replace(/\s/g, "");
    const a = state.accounts.find((a) => t.includes(a.name.replace(/\s/g, "").slice(0, 2)));
    return a ? a.id : state.accounts[0].id;
  }
  const existingKeys = () => new Set(state.tx.map(L.dedupeKey));

  function importSheet(rows, fileName) {
    let hi = L.findHeaderRow(rows);
    const manual = hi < 0;
    if (manual) hi = 0;
    const headers = rows[hi].map((x) => String(x == null ? "" : x).trim());
    const body = rows.slice(hi + 1);
    const m = L.detectColumns(headers);
    const model = { acc: guessAccount(fileName), sign: "", m };
    const render2 = () => {
      const acc = state.accounts.find((a) => a.id === model.acc);
      const hasSplit = model.m.out >= 0 || model.m.in >= 0;
      const signMode = model.sign || (acc && (acc.kind === "bank") && !hasSplit ? "signed" : "expense");
      const { tx, skipped } = L.rowsToTx(body, model.m, { accountId: model.acc, rules: state.rules, signMode, defaultYear: new Date().getFullYear() });
      const keys = existingKeys(); const seen = new Set();
      const fresh = tx.filter((t) => { const k = L.dedupeKey(t); if (keys.has(k) || seen.has(k)) return false; seen.add(k); return true; });
      model.fresh = fresh;
      const opt = (sel) => '<option value="-1">(없음)</option>' + headers.map((h, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${esc(h || "열 " + (i + 1))}</option>`).join("");
      openSheet(`<h3>가져오기 미리보기</h3><div class="hint">${esc(fileName)}${manual ? " · 헤더를 찾지 못했습니다. 아래에서 열을 직접 지정하세요." : ""}</div>
        <label class="f">이 파일의 카드·계좌</label><select id="im-acc">${state.accounts.map((a) => `<option value="${a.id}" ${a.id === model.acc ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
        <div class="grid"><div><label class="f">날짜 열</label><select data-m="date">${opt(model.m.date)}</select></div><div><label class="f">가맹점·적요 열</label><select data-m="memo">${opt(model.m.memo)}</select></div>
        <div><label class="f">금액 열</label><select data-m="amount">${opt(model.m.amount)}</select></div><div><label class="f">출금 열</label><select data-m="out">${opt(model.m.out)}</select></div>
        <div><label class="f">입금 열</label><select data-m="in">${opt(model.m.in)}</select></div>
        <div><label class="f">금액 부호</label><select id="im-sign"><option value="expense" ${signMode === "expense" ? "selected" : ""}>양수 = 지출 (카드)</option><option value="signed" ${signMode === "signed" ? "selected" : ""}>음수 = 지출, 양수 = 수입</option></select></div></div>
        <div class="card" style="margin-top:12px"><b>새로 추가 ${fresh.length}건</b> <span class="sub">· 중복 ${tx.length - fresh.length}건 · 제외 ${skipped.length}건</span>
        <div class="scroll-x"><table class="pv"><tr><th>날짜</th><th>구분</th><th>금액</th><th>분류</th><th>가맹점</th></tr>${fresh.slice(0, 8).map((t) => `<tr><td>${t.date}</td><td>${TYPE_LABEL[t.type]}</td><td>${won(t.amount)}</td><td>${esc(t.category)}</td><td>${esc(t.memo)}</td></tr>`).join("")}</table></div></div>
        <div class="btns"><button class="btn" id="im-cancel">취소</button><button class="btn primary" id="im-ok" ${fresh.length ? "" : "disabled"}>${fresh.length}건 추가</button></div>`);
      $("#im-acc").onchange = (e) => { model.acc = e.target.value; model.sign = ""; render2(); };
      $("#im-sign").onchange = (e) => { model.sign = e.target.value; render2(); };
      document.querySelectorAll("[data-m]").forEach((s) => (s.onchange = () => { model.m[s.dataset.m] = +s.value; render2(); }));
      $("#im-cancel").onclick = closeSheet;
      $("#im-ok").onclick = () => {
        fresh.forEach((t) => state.tx.push({ id: uid(), ...t }));
        if (fresh.length) ui.ym = fresh.map((t) => t.date).sort().pop().slice(0, 7);
        save(); closeSheet(); ui.tab = "list"; render(); toast(`${fresh.length}건을 추가했습니다.`);
      };
    };
    render2();
  }

  function importSms() {
    openSheet(`<h3>문자 붙여넣기</h3><div class="hint">카드 승인·입출금 문자를 붙여 넣으세요. 여러 건도 가능합니다. 문자 형식은 카드사마다 달라서, 결과를 확인하고 필요하면 고친 뒤 추가하세요.</div>
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
        const t = { date: p.date, type: p.type, amount: p.amount, memo: p.memo, accountId: guessAccount(raw), category: p.type === "income" ? "기타수입" : "기타" };
        L.applyRules(t, state.rules);
        return { t, raw: p.raw, on: true };
      }).filter(Boolean);
      $("#sms-out").innerHTML = items.length ? items.map((it, i) => `<div class="sms-item"><div class="raw">${esc(it.raw)}</div>
        <label><input type="checkbox" data-i="${i}" data-k="on" checked style="width:auto"> 추가</label>
        <div class="two"><input data-i="${i}" data-k="memo" value="${esc(it.t.memo)}"><input data-i="${i}" data-k="amount" inputmode="decimal" value="${it.t.amount}">
        <select data-i="${i}" data-k="accountId">${state.accounts.map((a) => `<option value="${a.id}" ${a.id === it.t.accountId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
        <select data-i="${i}" data-k="category">${allCats(it.t.type === "transfer" ? "transfer" : it.t.type).map((c) => `<option ${c === it.t.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div></div>`).join("")
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
      const keys = existingKeys(); let n = 0, dup = 0;
      for (const it of items) {
        if (!it.on || !isFinite(it.t.amount) || it.t.amount === 0) continue;
        const k = L.dedupeKey(it.t);
        if (keys.has(k)) { dup++; continue; }
        keys.add(k); state.tx.push({ id: uid(), ...it.t }); n++;
      }
      save(); closeSheet(); ui.tab = "list"; render(); toast(`${n}건 추가${dup ? `, 중복 ${dup}건 제외` : ""}`);
    };
  }

  // ---------- 백업 ----------
  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ledger-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function restoreBackup(file) {
    try {
      const s = JSON.parse(await file.text());
      if (!Array.isArray(s.tx) || !Array.isArray(s.accounts) || !Array.isArray(s.trades)) throw new Error("형식 오류");
      if (!confirm(`현재 데이터를 지우고 백업(내역 ${s.tx.length}건, 투자 ${s.trades.length}건)으로 교체할까요?`)) return;
      state = Object.assign(DEFAULT_STATE(), s);
      save(); render(); toast("복원했습니다.");
    } catch (e) { toast("백업 파일을 읽지 못했습니다."); }
  }

  // ---------- 이벤트 ----------
  function shiftMonth(d) {
    let [y, m] = ui.ym.split("-").map(Number);
    m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    ui.ym = `${y}-${pad(m)}`;
  }

  document.addEventListener("click", async (e) => {
    const tab = e.target.closest("#tabs button");
    if (tab) { ui.tab = tab.dataset.tab; return render(); }
    if (e.target.id === "overlay") return closeSheet();
    if (e.target.id === "fab") return ui.tab === "invest" ? tradeForm() : txForm();
    const ed = e.target.closest("[data-edit]");
    if (ed) return txForm(state.tx.find((t) => t.id === ed.dataset.edit));
    const et = e.target.closest("[data-edit-trade]");
    if (et) return tradeForm(state.trades.find((t) => t.id === et.dataset.editTrade));
    const ren = e.target.closest("[data-ren]");
    if (ren) {
      const a = state.accounts.find((x) => x.id === ren.dataset.ren);
      const n = prompt("새 이름", a.name); if (n && n.trim()) { a.name = n.trim(); save(); render(); }
      return;
    }
    const da = e.target.closest("[data-del-acc]");
    if (da) {
      const id = da.dataset.delAcc;
      if (state.tx.some((t) => t.accountId === id)) return toast("내역이 있는 계정은 삭제할 수 없습니다.");
      if (state.accounts.length <= 1) return toast("계정이 최소 1개는 필요합니다.");
      if (confirm("이 계정을 삭제할까요?")) { state.accounts = state.accounts.filter((a) => a.id !== id); save(); render(); }
      return;
    }
    const dr = e.target.closest("[data-del-rule]");
    if (dr) { state.rules.splice(+dr.dataset.delRule, 1); save(); return render(); }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    switch (act.dataset.act) {
      case "prev": shiftMonth(-1); return render();
      case "next": shiftMonth(1); return render();
      case "import-file": return $("#file").click();
      case "import-sms": return importSms();
      case "add-acc": {
        const name = prompt("계정 이름 (예: 국민은행)"); if (!name || !name.trim()) return;
        const kind = (prompt("종류를 입력하세요: 은행 / 신용카드 / 체크카드 / 증권 / 현금", "은행") || "은행").trim();
        const map = { 은행: "bank", 신용카드: "card", 체크카드: "check", 증권: "broker", 현금: "cash" };
        state.accounts.push({ id: uid(), name: name.trim(), kind: map[kind] || "bank" }); save(); return render();
      }
      case "add-rule": {
        const kw = prompt("키워드 (가맹점·적요에 포함된 글자)"); if (!kw || !kw.trim()) return;
        const category = prompt("분류 이름 (예: 식비)"); if (!category || !category.trim()) return;
        const asTransfer = confirm("이 키워드를 '이체'(수입·지출에서 제외)로 처리할까요?\n확인 = 이체, 취소 = 일반 분류");
        state.rules.unshift({ kw: kw.trim(), category: category.trim(), ...(asTransfer ? { toType: "transfer" } : {}) });
        save(); return render();
      }
      case "export": return exportBackup();
      case "restore": return $("#restore-file").click();
      case "wipe":
        if (confirm("모든 내역과 투자 기록을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?") && confirm("정말 삭제할까요? 먼저 백업 파일을 저장해 두는 것을 권장합니다.")) {
          state = DEFAULT_STATE(); save(); render(); toast("삭제했습니다.");
        }
    }
  });

  document.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.dataset.f) { ui[t.dataset.f] = t.value; return render(); }
    if (t.dataset.price !== undefined) {
      const v = L.parseAmount(t.value);
      if (isFinite(v) && v > 0) state.prices[t.dataset.price] = v; else delete state.prices[t.dataset.price];
      save(); return render();
    }
    if (t.id === "file" && t.files[0]) {
      const f = t.files[0]; t.value = "";
      try {
        const rows = await readFileRows(f);
        if (!rows.length) return toast("파일에서 내용을 찾지 못했습니다.");
        importSheet(rows, f.name);
      } catch (err) { toast(err.message || "파일을 읽지 못했습니다."); }
    }
    if (t.id === "restore-file" && t.files[0]) { const f = t.files[0]; t.value = ""; restoreBackup(f); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.dataset.f === "q") {
      ui.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const el = document.querySelector('[data-f="q"]'); el.focus(); el.setSelectionRange(pos, pos);
    }
  });

  load();
  showBanner();
  render();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
