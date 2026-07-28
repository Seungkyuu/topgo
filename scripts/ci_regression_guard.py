"""
겟챠 자동 동기화(GitHub Actions)용 회귀 가드.

matching 결과 JSON(real-prices.json, real-prices-import.json)의 항목 수를
git HEAD(직전 커밋, 즉 어제 자동 동기화 결과)와 비교한다. 겟챠 사이트 구조가
바뀌어 스크래핑이 조용히 깨지면 매칭 건수가 갑자기 확 줄어드는 식으로
드러나므로, 이전 대비 크게 줄었으면 워크플로를 실패시켜 자동 커밋을
막는다 — 깨진 데이터가 새벽에 그대로 배포되는 사고를 방지.

사용법: python scripts/ci_regression_guard.py
  (반드시 정합성 재계산 스크립트들을 먼저 돌린 뒤, git add/commit 전에 실행)
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 건수가 이 비율 밑으로 떨어지면 실패 처리 — 카탈로그 변동(신차 추가 등)으로
# 자연스럽게 소폭 흔들리는 건 허용하되, 스크래핑이 통째로 깨진 경우(예: 0건)는
# 반드시 잡아야 하므로 넉넉하지 않게 90%로 둔다.
MIN_RATIO = 0.9

FILES = [
    "lib/engine/data/real-prices.json",
    "lib/engine/data/real-prices-import.json",
]


def committed_count(relpath: str) -> int | None:
    try:
        raw = subprocess.run(
            ["git", "show", f"HEAD:{relpath}"],
            cwd=ROOT,
            capture_output=True,
            check=True,
            text=True,
        ).stdout
    except subprocess.CalledProcessError:
        return None  # 이전 커밋에 파일이 없었으면(최초 실행) 비교 생략
    return len(json.loads(raw))


def current_count(relpath: str) -> int:
    return len(json.loads((ROOT / relpath).read_text(encoding="utf-8")))


def main() -> None:
    failed = False
    for relpath in FILES:
        before = committed_count(relpath)
        after = current_count(relpath)
        if before is None:
            print(f"{relpath}: 이전 커밋 없음 — 비교 생략 (현재 {after}건)")
            continue
        ratio = after / before if before > 0 else 0
        status = "OK" if ratio >= MIN_RATIO else "FAIL"
        print(f"{relpath}: {before} → {after}건 ({ratio:.0%}) [{status}]")
        if ratio < MIN_RATIO:
            failed = True

    if failed:
        print(f"\n매칭 건수가 이전 대비 {MIN_RATIO:.0%} 밑으로 떨어졌습니다 — 자동 커밋을 중단합니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
