import React, { useState } from "react";

const getSuggestionConfig = (suggestion, reason, confidence) => {
  switch (suggestion) {
    case "TURN_ON_TOMORROW":
      return {
        colorClass: "text-green-600",
        dotClass: "bg-green-500",
        text: "Turn ON",
        subText: `(${confidence >= 80 ? "High probability" : reason})`
      };
    case "TURN_OFF_TOMORROW":
      return {
        colorClass: "text-red-600",
        dotClass: "bg-red-500",
        text: "Turn OFF",
        subText: `(${reason})`
      };
    case "KEEP_ON_TOMORROW":
      return {
        colorClass: "text-green-600",
        dotClass: "bg-green-500",
        text: "Keep ON",
        subText: ""
      };
    case "KEEP_OFF_TOMORROW":
      return {
        colorClass: "text-orange-500",
        dotClass: "bg-orange-500",
        text: "Keep OFF",
        subText: ""
      };
    default:
      return {
        colorClass: "text-gray-500",
        dotClass: "bg-gray-500",
        text: "Unknown",
        subText: ""
      };
  }
};

const normalizePeakFrequency = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (/^D[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `D${raw}`;

  return "D0";
};

const getPeakFrequencyColor = (value) => {
  const peak = normalizePeakFrequency(value);
  const n = Number(peak.slice(1));

  if (n <= 2) return "#FF3B30"; // red
  if (n <= 4) return "#FB8C00"; // orange
  return "#0F9D58"; // green
};

const getPeakFrequencyNumber = (value) => {
  const peak = normalizePeakFrequency(value);
  const n = Number(peak.slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
};

const computePeakFrequency = (last8Days) => {
  if (!last8Days || typeof last8Days !== "object") return "D0";

  let count = 0;
  const today = new Date();

  for (let i = 0; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
    const entry = last8Days[dateStr];
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status === "delivered") count++;
  }

  return `D${Math.min(count, 7)}`;
};

const resolvePeakFrequency = (customer) => {
  const savedPeak = normalizePeakFrequency(
    customer?.Peak_Frequency || customer?.peakFrequency || customer?.peak_frequency,
  );
  const currentPeak = computePeakFrequency(customer?.last8Days);

  return getPeakFrequencyNumber(savedPeak) >= getPeakFrequencyNumber(currentPeak)
    ? savedPeak
    : currentPeak;
};

const normalizePotential = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "T1";

  const normalized = raw.replace(/T\s*(\d+)/, "T$1");
  const match = normalized.match(/^T(\d+)$/);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) && num > 0 ? `T${num}` : "T1";
  }

  return "T1";
};

const getPotentialColor = (value) => {
  const potential = normalizePotential(value);
  const num = parseInt(potential.slice(1), 10);

  // T1-T7 = red, T8-T15 = orange, T20+ = green
  if (num <= 7) return "#FF3B30"; // red
  if (num <= 15) return "#FB8C00"; // orange
  return "#0F9D58"; // green
};

function getDateStringInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (error) {}
  return new Date().toISOString().slice(0, 10);
}

function getDateDayNumber(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(time)) return null;
  return Math.floor(time / 86400000);
}

function computeDeliveryGap(last8Days, todayDate) {
  if (!last8Days || typeof last8Days !== "object") return "G10";
  const todayDayNumber = getDateDayNumber(todayDate);
  if (todayDayNumber === null) return "G10";
  let latestDeliveredDayNumber = null;
  Object.entries(last8Days).forEach(([dateStr, entry]) => {
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    ).trim().toLowerCase();
    if (status !== "delivered") return;
    const dayNumber = getDateDayNumber(dateStr);
    if (dayNumber === null || dayNumber > todayDayNumber) return;
    if (latestDeliveredDayNumber === null || dayNumber > latestDeliveredDayNumber) {
      latestDeliveredDayNumber = dayNumber;
    }
  });
  if (latestDeliveredDayNumber === null) return "G10";
  return `G${Math.min(todayDayNumber - latestDeliveredDayNumber, 10)}`;
}

function normalizeDeliveryGap(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  const match = raw.match(/^G?(\d+)$/);
  if (!match) return "G10";
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return "G10";
  return `G${Math.min(Math.floor(n), 10)}`;
}

function getDeliveryGapNumber(value) {
  const gap = normalizeDeliveryGap(value);
  const n = Number(gap.slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 10;
}

function getDeliveryGapColor(value) {
  const n = getDeliveryGapNumber(value);
  if (n === 0) return "#0F9D58";
  if (n <= 2) return "#FB8C00";
  return "#FF3B30";
}

const AISuggestionRow = ({ customer, suggestionData }) => {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    // Show temporary toast (mock functionality)
    alert("AI Suggestion Applied");
    setApplied(true);
    
    // Reset back after a bit for demo purposes, or keep it applied
    setTimeout(() => setApplied(false), 3000);
  };

  const isTodayOn = customer?.todayOverride?.status === "ON";
  const peakFrequency = resolvePeakFrequency(customer);
  const peakPotential = normalizePotential(customer?.potential);
  const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
  const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
  const deliveryGap = normalizeDeliveryGap(customer?.deliveryGap || rawDeliveryGap);
  const { colorClass, dotClass, text, subText } = getSuggestionConfig(
    suggestionData.suggestion,
    suggestionData.reason,
    suggestionData.confidence
  );

  return (
    <tr className="border-t hover:bg-gray-50 bg-white">
      <td className="p-4 py-5 text-gray-700">{customer.custid}</td>
      <td className="p-4 py-5 text-gray-900 font-bold">{customer.name}</td>

      <td className="p-4 py-5 text-gray-700 font-medium">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getPeakFrequencyColor(peakFrequency) }}
        >
          {peakFrequency}
        </span>
      </td>

      <td className="p-4 py-5 text-gray-700 font-medium">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getPotentialColor(peakPotential) }}
        >
          {peakPotential}
        </span>
      </td>

      <td className="p-4 py-5 text-gray-700 font-medium">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getDeliveryGapColor(deliveryGap) }}
        >
          {deliveryGap}
        </span>
      </td>
      
      {/* Current Toggle Column */}
      <td className="p-4 py-5">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isTodayOn ? "bg-green-500" : "bg-red-500"} shadow-sm`}></div>
          <span className={`text-sm ${isTodayOn ? "text-gray-700" : "text-gray-700"}`}>
            {isTodayOn ? "ON" : "OFF"}
          </span>
        </div>
      </td>

      {/* AI Suggestion Column */}
      <td className="p-4 py-5">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${dotClass} shadow-sm mt-0.5`}></div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-800">
              {text} {subText && <span className="text-gray-500 font-normal ml-1">{subText}</span>}
            </span>
          </div>
        </div>
      </td>

      {/* Apply AI Suggestion Column */}
      <td className="p-4 py-5">
        {applied ? (
          <div className="flex items-center text-gray-700 space-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm">Applied</span>
          </div>
        ) : (
          <button
            onClick={handleApply}
            className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
          >
            [Apply]
          </button>
        )}
      </td>
    </tr>
  );
};

export default AISuggestionRow;
