# 코인프리미엄 - 거래소 시세 비교

국내 거래소(Upbit/Bithumb)와 해외 거래소(Gate/Binance)의 실시간 가격을 비교해 김치프리미엄을 계산합니다.

## 실행 방법

```bash
node server.js
```

브라우저에서 http://localhost:3001 접속

## 데이터 소스

- **국내 가격**: [Upbit API](https://docs.upbit.com/reference/ticker%ED%98%84%EC%9E%AC%EA%B0%80-%EC%A0%95%EB%B3%B4), [Bithumb API](https://apidocs.bithumb.com/) (실시간 현재가)
- **해외 가격**: [Gate.io API](https://www.gate.io/docs/developers/apiv4/), [Binance API](https://binance-docs.github.io/apidocs/spot/en/) (실시간 현재가)
- **원/달러 환율**: [open.er-api.com](https://www.exchangerate-api.com/docs/free) → 실패 시 [frankfurter.dev](https://frankfurter.dev/) 순으로 조회. 두 API가 모두 실패하면 마지막으로 성공했던 값을 `config.json`에서 읽어 사용합니다(예전에는 네이버 금융 페이지를 크롤링했지만, 해당 페이지가 `stock.naver.com`으로 영구 리다이렉트되면서 더 이상 동작하지 않아 교체했습니다).

