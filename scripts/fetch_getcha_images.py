#!/usr/bin/env python3
"""겟챠 이미지를 우리 쪽으로 내려받아 self-host 한다.

가격은 이미 우리가 복사해서 갖고 있는데(real-prices.json) 이미지만
겟챠 URL을 그대로 참조하고 있었다. 그래서 겟챠가 핫링크를 막자
(403) 사이트의 모든 사진이 한꺼번에 깨졌다 — 가격은 멀쩡한데
사진만 죽는 구조였던 것.

이 스크립트는 scrape_getcha.py가 저장한 원격 URL을 실제 파일로
내려받아 public/ 아래에 두고, JSON의 값을 로컬 경로로 바꿔치기한다.
그러면 사진도 가격과 똑같이 "우리가 가진 것"이 되고, 겟챠가 뭘 하든
사이트는 그대로 뜬다.

멱등(idempotent): 이미 로컬 경로(/car-img/...)로 바뀐 값은 건너뛰고,
이미 받아둔 파일도 다시 받지 않는다. 매일 도는 워크플로에서 새로
생긴 이미지만 추가로 받는다.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "lib" / "engine" / "data"
OUT_DIR = ROOT / "public" / "car-img"
PUBLIC_PREFIX = "/car-img"

TARGETS = [
    # (JSON 파일, 중첩 깊이) — getcha-images는 {브랜드: {모델: URL}},
    # brand-logos는 {브랜드: URL}
    (DATA / "getcha-images.json", 2),
    (DATA / "brand-logos.json", 1),
]

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def local_name(url: str) -> str:
    """URL에서 파일명을 뽑는다. 겟챠 파일명은 타임스탬프+랜덤이라
    이미 충분히 고유하다(예: 1713943614PsJE3qprpl.png)."""
    name = url.split("?")[0].rstrip("/").split("/")[-1]
    if not name:
        name = str(abs(hash(url)))
    if "." not in name:
        name += ".png"
    # 경로 조작 방지 — 파일명만 남긴다
    return os.path.basename(name)


def download(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://getcha.io/"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            body = res.read()
    except Exception as e:  # noqa: BLE001 — 개별 실패는 건너뛰고 계속 간다
        print(f"  ! 실패 {url} — {e}")
        return False
    if len(body) < 200:  # 에러 페이지/빈 응답 방어
        print(f"  ! 응답이 너무 작음({len(body)}B) {url}")
        return False
    dest.write_bytes(body)
    return True


def walk(node, depth: int, stats: dict) -> None:
    """중첩 dict를 돌면서 URL 값을 로컬 경로로 바꾼다(제자리 수정)."""
    if depth == 1:
        for key, url in list(node.items()):
            if not isinstance(url, str) or not url.startswith("http"):
                stats["skipped"] += 1
                continue
            name = local_name(url)
            dest = OUT_DIR / name
            if dest.exists():
                node[key] = f"{PUBLIC_PREFIX}/{name}"
                stats["cached"] += 1
                continue
            if download(url, dest):
                node[key] = f"{PUBLIC_PREFIX}/{name}"
                stats["downloaded"] += 1
            else:
                stats["failed"] += 1
        return
    for sub in node.values():
        if isinstance(sub, dict):
            walk(sub, depth - 1, stats)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total = {"downloaded": 0, "cached": 0, "failed": 0, "skipped": 0}

    for path, depth in TARGETS:
        if not path.exists():
            print(f"건너뜀(파일 없음): {path.name}")
            continue
        print(f"\n== {path.name} ==")
        data = json.loads(path.read_text(encoding="utf-8"))
        stats = {"downloaded": 0, "cached": 0, "failed": 0, "skipped": 0}
        walk(data, depth, stats)
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(
            f"  신규 {stats['downloaded']} / 기존 {stats['cached']} / "
            f"실패 {stats['failed']} / 이미 로컬 {stats['skipped']}"
        )
        for k in total:
            total[k] += stats[k]

    print(
        f"\n합계: 신규 {total['downloaded']} / 기존 {total['cached']} / "
        f"실패 {total['failed']} / 이미 로컬 {total['skipped']}"
    )

    # 전부 실패했다면(네트워크 차단 등) 로컬 경로로 안 바뀐 채 끝난 것이니
    # 워크플로가 조용히 넘어가지 않도록 실패로 알린다. 단, 받을 게 처음부터
    # 없었던 경우(전부 이미 로컬)는 정상이다.
    attempted = total["downloaded"] + total["failed"]
    if attempted > 0 and total["downloaded"] == 0:
        print("\n오류: 한 장도 못 받았습니다 — 원격이 막혔는지 확인 필요")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
