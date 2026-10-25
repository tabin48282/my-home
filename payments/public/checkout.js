(async () => {
  const summary = document.getElementById("summary");
  const payButton = document.getElementById("pay");

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "glink-sample" }),
  });
  if (!res.ok) { summary.textContent = "주문 생성에 실패했습니다."; return; }
  const order = await res.json();

  summary.textContent = `${order.orderName} / ${order.amount.toLocaleString()}원`;

  // 비회원 결제는 ANONYMOUS, 회원은 추측 불가능한 고유값(UUID 등)을 사용한다.
  const tossPayments = TossPayments(order.clientKey);
  const widgets = tossPayments.widgets({ customerKey: TossPayments.ANONYMOUS });

  await widgets.setAmount({ currency: "KRW", value: order.amount });
  await Promise.all([
    widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
    widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
  ]);
  payButton.disabled = false;

  payButton.addEventListener("click", async () => {
    payButton.disabled = true;
    try {
      await widgets.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${location.origin}/success.html`,
        failUrl: `${location.origin}/fail.html`,
      });
    } catch (e) {
      // 사용자가 결제창을 닫은 경우(USER_CANCEL) 등
      payButton.disabled = false;
    }
  });
})();
