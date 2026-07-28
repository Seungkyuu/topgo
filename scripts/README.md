# 스크립트 실행 순서 (엑셀·겟챠 동기화 체크리스트)

이 디렉터리는 "엑셀 원본 → 카탈로그 JSON → 겟챠 실가격 매칭 → 모델 그룹핑"
파이프라인 전체를 담당한다. 각 단계는 이전 단계의 산출물만 읽고, 원본
엑셀 추출 JSON(`lib/engine/*/data/*.json`)은 절대 덮어쓰지 않는다 —
`docs/architecture.md`의 "엑셀 → 앱은 1회성 포팅" 원칙 유지.

## 1. 캐피탈사가 새 엑셀을 보냈을 때

브랜드/상품별로 해당 추출 스크립트를 재실행한다(`카탈로그` 자체를 갱신):

| 소스 | 스크립트 | 비고 |
|---|---|---|
| 신한 오토리스(운용·금융) | `extract_shinhan.py extract <엑셀>` | 완전 자동 재실행 가능. 골든케이스 자체 검증 후 저장 |
| 신한 렌터카 | `extract_shinhan_rental.py extract <엑셀>` | 위와 동일 |
| 메리츠 수입 리스 | `extract_meritz_lease.py extract <엑셀>` | 위와 동일 |
| 메리츠 렌터카 | `extract_meritz.py discover <엑셀>` → `EXTRACT_CONFIG` 수기 보정 → `extract` | **반자동** — 시트 레이아웃이 바뀌면 설정을 사람이 확인해야 한다 |
| 오릭스 / 메리츠 테슬라·BYD | (스크립트 없음) | 현재 수동/비문서화 프로세스 — 카탈로그 JSON을 직접 편집 |

## 2. 겟챠 실가격 재매칭 (가격이 자주 바뀌므로 정기적으로도 재실행)

```bash
python scrape_getcha.py                 # getcha-offers.json 갱신
node dump_catalog_labels.mjs            # .cache/*-labels.json 갱신(1의 결과 반영)
python match_import_prices.py           # 수입차 → real-prices-import.json, import-offer-key.json
python match_getcha_prices.py           # 국산·테슬라·BYD → real-prices.json
```

**자동화**: `.github/workflows/sync-getcha-prices.yml`이 매일 05:00 KST에 이
2번·3번(모델 그룹 재계산)·`ci_regression_guard.py`(매칭 건수가 이전 대비
90% 밑으로 떨어지면 중단)를 순서대로 돌리고, 통과하면 결과를 `main`에
자동 커밋·푸시한다. 수동 실행은 GitHub Actions 탭에서
"겟챠 가격 자동 동기화" 워크플로를 `workflow_dispatch`로 트리거하면 된다.
(1번 — 캐피탈사 엑셀 추출 — 은 자동화 대상이 아니다. 새 엑셀은 여전히
사람이 직접 받아서 돌려야 한다.)

## 3. 모델 그룹(트림 선택 UI) 재계산

카탈로그가 바뀌었거나(1) `vehicle_taxonomy.py`의 분류 규칙을 고쳤다면
**반드시** 재실행 — 안 하면 UI가 예전 그룹으로 남는다:

```bash
python build_model_groups.py            # lib/engine/data/model-groups.json 갱신
```

2와 3은 서로 독립적이다(model-groups.json은 getcha-offers.json을 안 읽는다)
— 둘 다 `vehicle_taxonomy.py`의 브랜드 분류 규칙만 공유한다.

## 4. 검증 (커밋 전 필수)

```bash
python match_import_prices.py | tail -5   # 매칭 건수가 의도치 않게 줄지 않았는지
python match_getcha_prices.py             # 위와 동일
cd .. && npx vitest run && npx tsc --noEmit
```

`vehicle_taxonomy.py`를 고칠 땐 특히 매칭 건수(현재 기준 수입차
654/1855, 국산·테슬라·BYD 128/160)를 실행 전후로 비교한다 — 그룹핑
규칙 수정이 겟챠 가격 매칭에 부작용을 안 주는지 확인하는 유일한
안전장치다.

## 파일 지도

- `vehicle_taxonomy.py` — 브랜드 분리·코드/단어 토큰화·클래스 별칭 등
  "라벨을 어떻게 해석할지"를 다루는 공용 로직. `match_import_prices.py`,
  `match_getcha_prices.py`, `build_model_groups.py`가 전부 이걸 재사용한다
  — 새 브랜드/모델 규칙은 여기 한 곳에만 추가하면 세 스크립트에 동시
  적용된다.
- `match_import_prices.py` — 수입차(오릭스·신한·메리츠수입) 라벨 ↔
  겟챠 실가격.
- `match_getcha_prices.py` — 국산차·테슬라·BYD 라벨 ↔ 겟챠 실가격.
- `build_model_groups.py` — 전 소스 라벨 ↔ 모델 그룹(트림 선택 UI 2단계).
- `ci_regression_guard.py` — 자동 동기화 워크플로 전용. 매칭 건수를 직전
  커밋과 비교해 급감하면 실패 처리(자동 커밋 차단).
