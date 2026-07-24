import React, { useState } from "react";
import { FiCalendar } from "react-icons/fi";
import {
  computeCurrentCategory,
  getTodayEffectiveStatus,
} from "../utils/aiSuggestionEngine";
import ExecutionCalendarModal from "./ExecutionCalendarModal";

const getSuggestionConfig = (suggestion, reason, score) => {
  const scoreReason = String(reason || "").includes("AI Score")
    ? reason
    : `AI Score: ${score} - ${reason}`;

  switch (suggestion) {
    case "TURN_ON_TOMORROW":
      return {
        colorClass: "text-green-600",
        dotClass: "bg-green-500",
        text: "Turn ON",
        subText: `(${scoreReason})`
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

const getCurrentCategoryColor = (value) => {
  const currentCategory = normalizePeakFrequency(value);
  const n = Number(currentCategory.slice(1));

  if (n <= 2) return "#FF3B30";
  if (n <= 4) return "#FB8C00";
  return "#0F9D58";
};

const getSuggestionStatus = (suggestion) => {
  switch (suggestion) {
    case "TURN_ON_TOMORROW":
    case "KEEP_ON_TOMORROW":
      return "ON";
    case "TURN_OFF_TOMORROW":
    case "KEEP_OFF_TOMORROW":
      return "OFF";
    default:
      return null;
  }
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
  } catch (error) { }
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

const AISuggestionRow = ({
  customer,
  suggestionData,
  onApplySuggestion,
  isUpdating = false,
}) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isTodayOn = getTodayEffectiveStatus(customer) === "ON";
  const suggestedStatus = getSuggestionStatus(suggestionData.suggestion);
  const alreadyApplied = suggestedStatus === (isTodayOn ? "ON" : "OFF");
  const peakFrequency = resolvePeakFrequency(customer);
  const currentCategory = computeCurrentCategory(customer?.last8Days);
  const peakPotential = normalizePotential(customer?.potential);
  const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
  const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
  const deliveryGap = normalizeDeliveryGap(customer?.deliveryGap || rawDeliveryGap);
  const { dotClass, text, subText } = getSuggestionConfig(
    suggestionData.suggestion,
    suggestionData.reason,
    suggestionData.score
  );

  return (
    <tr className={`border-t hover:bg-gray-50 bg-white text-center ${calendarOpen ? 'relative z-50' : ''}`}>
      <td className="px-2 py-3 text-gray-700">{customer.custid}</td>
      <td className="px-2 py-3 text-gray-900 font-bold">{customer.name}</td>
      <td className="px-1.5 py-3 text-[11px] text-gray-700 font-medium max-w-[150px] break-words whitespace-normal leading-tight">{customer.route || "-"}</td>

      <td className="px-2 py-3 text-gray-700 font-medium">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getPotentialColor(peakPotential) }}
        >
          {peakPotential}
        </span>
      </td>

      <td className="px-2 py-3 text-gray-700 font-medium">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getPeakFrequencyColor(peakFrequency) }}
        >
          {peakFrequency}
        </span>
      </td>

      <td className="px-2 py-3 text-gray-700 font-medium">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getDeliveryGapColor(deliveryGap) }}
        >
          {deliveryGap}
        </span>
      </td>

      <td className="px-2 py-3 text-gray-700 font-medium">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getCurrentCategoryColor(currentCategory) }}
        >
          {currentCategory}
        </span>
      </td>

      {/* Current Toggle Column */}
      <td className="px-2 py-3">
        <div className="flex items-center justify-center space-x-1">
          <div className={`w-2.5 h-2.5 rounded-full ${isTodayOn ? "bg-green-500" : "bg-red-500"} shadow-sm`}></div>
          <span className="text-xs text-gray-700">
            {isTodayOn ? "ON" : "OFF"}
          </span>
        </div>
      </td>

      {/* AI Suggestion Column */}
      <td className="px-2 py-3">
        <div className="flex items-center justify-center space-x-1">
          <div className={`w-2.5 h-2.5 rounded-full ${dotClass} shadow-sm mt-0.5`}></div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-800">
              {text} {subText && <span className="text-gray-500 font-normal ml-1">{subText}</span>}
            </span>
          </div>
        </div>
      </td>

      {/* Apply AI Suggestion Column */}
      <td className="px-2 py-3">
        <div className="flex items-center justify-center gap-1">
          <label
            className={`relative inline-flex items-center ${isUpdating || !suggestedStatus || alreadyApplied
                ? "opacity-70 cursor-not-allowed"
                : "cursor-pointer"
              }`}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isTodayOn}
              disabled={isUpdating || !suggestedStatus || alreadyApplied}
              onChange={() => onApplySuggestion?.(customer, suggestedStatus)}
              aria-label={`Apply AI suggestion: ${suggestedStatus || "Unknown"}`}
            />
            <div className="w-10 h-5 bg-gray-300 rounded-full peer peer-checked:bg-green-600 transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
          </label>
          <span className="text-xs font-medium text-gray-600">
            {suggestedStatus || "--"}
          </span>
        </div>
      </td>

      {/* Execution Calendar Column */}
      <td className="px-2 py-3">
        <div className="relative inline-block">
          <div
            className="flex justify-center items-center cursor-pointer hover:bg-gray-100 p-1.5 rounded-full transition-colors w-min mx-auto"
            onClick={(e) => {
              e.stopPropagation();
              setCalendarOpen((prev) => !prev);
            }}
            title="Click to view full calendar"
          >
            <FiCalendar className="w-4 h-4 text-blue-600" />
          </div>
          {calendarOpen && (
            <ExecutionCalendarModal
              customer={customer}
              onClose={() => setCalendarOpen(false)}
            />
          )}
        </div>
      </td>
    </tr>
  );
};

export default AISuggestionRow;
