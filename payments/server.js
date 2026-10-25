// 토스페이먼츠 결제 연동 서버 (결제위젯 v2 + 결제 승인 API)
// 실행: node server.js  (Node 18 이상, 외부 패키지 없음)
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_KEY = process.env.TOSS_CLIENT_KEY;
const SECRET_KEY = process.env.TOSS_SECRET_KEY;
const TOSS_API_BASE = process.env.TOSS_API_BASE || "https://api.tosspayments.com";
const PUBLIC_DIR = path.join(__dirname, "public");

if (!CLIENT_KEY || !SECRET_KEY) {
  console.error("TOSS_CLIENT_KEY, TOSS_SECRET_KEY 환경 변수를 설정하세요. (.env.example 참고)");
  process.exit(1);
}

// 금액은 반드시 서버가 정한다. 클라이언트가 보낸 금액은 신뢰하지 않는다.
const CATALOG = {
  "glink-sample": { name: "GLINK 샘플 상품", amount: 15000 },
};

// 데모용 메모리 저장소. 실서비스에서는 DB로 교체한다.
const orders = new Map(); // orderId -> { orderName, amount, status, payment }

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e5) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { reject(e); }
    });
  });
}

// POST /api/orders : 주문 생성 (orderId, 금액 확정)
async function createOrder(req, res) {
  const { productId } = await readJson(req);
  const product = CATALOG[productId];
  if (!product) return sendJson(res, 400, { message: "알 수 없는 상품입니다." });

  const orderId = "ORD-" + crypto.randomBytes(12).toString("hex"); // 영문 대소문자, 숫자, -, _ 6~64자
  orders.set(orderId, { orderName: product.name, amount: product.amount, status: "READY" });
  sendJson(res, 200, {
    clientKey: CLIENT_KEY,
    orderId,
    orderName: product.name,
    amount: product.amount,
  });
}

// POST /api/confirm : 결제 승인. 금액 검증 후 토스페이먼츠 승인 API 호출
async function confirmPayment(req, res) {
  const { paymentKey, orderId, amount } = await readJson(req);
  const order = orders.get(orderId);

  if (!order) return sendJson(res, 404, { message: "주문을 찾을 수 없습니다." });
  if (order.amount !== Number(amount)) {
    return sendJson(res, 400, { message: "결제 금액이 주문 금액과 일치하지 않습니다." });
  }
  if (order.status === "DONE") return sendJson(res, 200, order.payment); // 새로고침 등 중복 호출

  const auth = Buffer.from(SECRET_KEY + ":").toString("base64");
  const response = await fetch(`${TOSS_API_BASE}/v1/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "Idempotency-Key": orderId, // 네트워크 재시도 시 중복 승인 방지
    },
    body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
  });
  const payment = await response.json();

  if (!response.ok) {
    return sendJson(res, response.status, { code: payment.code, message: payment.message });
  }
  order.status = "DONE";
  order.payment = payment;
  sendJson(res, 200, payment);
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not Found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/orders") return await createOrder(req, res);
    if (req.method === "POST" && req.url === "/api/confirm") return await confirmPayment(req, res);
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { message: "서버 오류가 발생했습니다." });
  }
});

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
