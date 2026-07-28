"""
신한카드 장기렌트 엑셀 → JSON 추출기.

마스터 테이블: `차량모델기준` 시트 (579개 모델).
  A=브랜드 B=모델 C=차량가 D=배기량 E=연료 H=일반잔가군 J=정비등급
  R~X = 잔가율(기간 12/24/36/42/44/48/60, 약정거리 기준선 — 골든케이스 F21=20,000km와 일치)
  Y = 고잔가수수료율(모델별, 골든케이스 1.5%와 일치)

사용법: python scripts/extract_shinhan_rental.py extract <엑셀파일>
"""

import sys
import json
from pathlib import Path

import openpyxl

OUT_DIR = Path(__file__).parent.parent / "lib/engine/shinhan/data"
TERMS = ["12", "24", "36", "42", "44", "48", "60"]


def extract(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb["차량모델기준"]
    rows = list(ws.iter_rows(min_row=12, max_row=1359, min_col=1, max_col=25, values_only=True))

    vehicles = {}
    current_brand = None
    for row in rows:
        brand, model, price = row[0], row[1], row[2]
        if brand:
            current_brand = str(brand).strip()
        brand = current_brand
        if not brand or not model or not price:
            continue
        key = f"{brand} {model}".strip()
        if key in vehicles:
            continue
        residual = {}
        for i, t in enumerate(TERMS):
            v = row[17 + i]  # R(idx17)~X(idx23)
            if v is not None:
                residual[t] = round(float(v), 4)
        vehicles[key] = {
            "brand": str(brand).strip(),
            "model": str(model).strip(),
            "vehiclePrice": int(price),
            "engineCc": int(row[3] or 0),
            "fuel": str(row[4] or ""),
            "residualGroup": str(row[7] or ""),
            "maintenanceGrade": str(row[9] or ""),
            "guaranteeFeeRate": float(row[24]) if row[24] else 0.015,
            "residualByTerm": residual,
        }
    print(f"모델 {len(vehicles)}개 추출")

    gk = vehicles.get("BMW 120i sport")
    print("골든케이스 120i sport:", gk)
    assert gk and gk["vehiclePrice"] == 47_300_000
    assert gk["residualByTerm"]["60"] == 0.5

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    v = dict(vehicles)
    v["_note"] = "신한카드 장기렌트 2607_V1 '차량모델기준' 시트에서 추출 (약정거리 20,000km 기준선)"
    (OUT_DIR / "rental-vehicles.json").write_text(json.dumps(v, ensure_ascii=False, indent=1))
    print("✅ rental-vehicles.json 저장")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] != "extract":
        print(__doc__)
        sys.exit(1)
    extract(sys.argv[2])
