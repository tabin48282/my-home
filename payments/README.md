# 토스페이먼츠 결제 연동 (결제위젯 v2)

## 흐름
1. `index.html` 로드 → `POST /api/orders`: 서버가 orderId와 금액을 확정
2. 결제위젯 렌더링 → 사용자가 결제 수단 선택 후 `requestPayment`
3. 성공 시 `success.html?paymentKey=…&orderId=…&amount=…` 로 리다이렉트
4. `POST /api/confirm`: 서버가 **저장된 주문 금액과 대조**한 뒤 `POST /v1/payments/confirm` 호출
5. 실패 시 `fail.html?code=…&message=…`

## 실행
```bash
cd payments
export TOSS_CLIENT_KEY=test_ck_...   # .env.example 참고
export TOSS_SECRET_KEY=test_sk_...
node server.js                        # Node 18 이상, http://localhost:3000
```

## 운영 전 필수 사항
- 시크릿 키는 서버 환경 변수로만 사용하고 저장소에 커밋하지 않는다.
- `orders`(메모리 Map)를 DB로 교체한다. 재시작하면 주문 정보가 사라진다.
- 운영 키(`live_ck_` / `live_sk_`)로 교체하려면 토스페이먼츠 가맹점 계약과 심사가 필요하다.
- HTTPS 적용, 웹훅(가상계좌 입금, 결제 취소 상태 동기화) 처리, 결제 취소 API 연동은 포함되어 있지 않다.
- 위젯 SDK 사용법과 승인 API 스펙은 공식 문서(docs.tosspayments.com)로 최종 확인한다.
