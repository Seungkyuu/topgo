"use client";

import { useState } from "react";
import { useQuoteSettings } from "../settings-context";
import { ALL_CAPITALS } from "@/lib/engine/capitals";

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="admin-toggle-row" onClick={() => onChange(!value)}>
      <div className="admin-toggle-text">
        <span className="admin-toggle-label">{label}</span>
        <span className="admin-toggle-desc">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={`toggle-switch${value ? " on" : ""}`}
        onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}

export default function AdminPage() {
  const { settings, update } = useQuoteSettings();
  const [saved, setSaved] = useState(false);

  const toggleCapital = (capital: string) => {
    const current = settings.enabledCapitals.length > 0
      ? settings.enabledCapitals
      : ALL_CAPITALS;
    const next = current.includes(capital)
      ? current.filter((c) => c !== capital)
      : [...current, capital];
    update({ enabledCapitals: next.length === ALL_CAPITALS.length ? [] : next });
    setSaved(false);
  };

  const isCapitalEnabled = (capital: string) =>
    settings.enabledCapitals.length === 0 ||
    settings.enabledCapitals.includes(capital);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <main className="wrap">
      <p className="brand">RENTO · 관리자</p>
      <h1>고객 화면 설정</h1>
      <p className="sub">고객에게 공개할 정보와 표시할 금융사를 선택합니다</p>

      <div className="card">
        <p className="admin-section-title">고객 공개 정보</p>

        <Toggle
          label="금리 표시"
          description="각 금융사의 적용 금리를 고객에게 보여줍니다"
          value={settings.showRate}
          onChange={(v) => { update({ showRate: v }); setSaved(false); }}
        />
        <Toggle
          label="보증금 금액 표시"
          description="운용리스 보증금 금액을 고객에게 보여줍니다"
          value={settings.showDeposit}
          onChange={(v) => { update({ showDeposit: v }); setSaved(false); }}
        />
        <Toggle
          label="잔가 정보 표시"
          description="계약 만기 시 잔가(예상 반납 기준가)를 보여줍니다"
          value={settings.showResidual}
          onChange={(v) => { update({ showResidual: v }); setSaved(false); }}
        />
        <Toggle
          label="이용금액 표시"
          description="취득원가·선납금 차감 후 실 이용금액을 보여줍니다"
          value={settings.showFinancedAmount}
          onChange={(v) => { update({ showFinancedAmount: v }); setSaved(false); }}
        />
      </div>

      <div className="card">
        <p className="admin-section-title">표시할 금융사</p>
        <p className="admin-section-sub">모두 선택 시 준비된 금융사가 자동으로 표시됩니다</p>
        <div className="capital-check-list">
          {ALL_CAPITALS.map((cap) => (
            <label key={cap} className="capital-check-row">
              <input
                type="checkbox"
                checked={isCapitalEnabled(cap)}
                onChange={() => toggleCapital(cap)}
              />
              <span>{cap}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="save-btn"
        onClick={handleSave}
      >
        {saved ? "저장됨 ✓" : "설정 저장"}
      </button>

      <p className="note" style={{ textAlign: "center", marginTop: 16 }}>
        설정은 이 기기에 저장됩니다. 고객 화면: <a href="/" className="admin-link">견적 페이지 →</a>
      </p>
    </main>
  );
}
