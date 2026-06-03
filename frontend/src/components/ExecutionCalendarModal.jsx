import React, { useMemo } from 'react';

const ExecutionCalendarModal = ({ customer, onClose }) => {
  const today = new Date();
  
  // Generate the last 30 days (from today - 29 to today)
  const last30Days = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      days.push(d);
    }
    return days;
  }, []);

  const firstDayOfWeek = last30Days.length > 0 ? last30Days[0].getDay() : 0; // 0 is Sunday

  const headerText = useMemo(() => {
    if (last30Days.length === 0) return "Last 30 Days";
    const firstDay = last30Days[0];
    const lastDay = last30Days[last30Days.length - 1];
    
    const m1 = firstDay.toLocaleString('default', { month: 'long' });
    const y1 = firstDay.getFullYear();
    
    const m2 = lastDay.toLocaleString('default', { month: 'long' });
    const y2 = lastDay.getFullYear();
    
    if (m1 === m2 && y1 === y2) {
      return `${m1} ${y1}`;
    } else if (y1 === y2) {
      return `${m1} - ${m2} ${y1}`;
    } else {
      return `${m1} ${y1} - ${m2} ${y2}`;
    }
  }, [last30Days]);

  // Helper to format date exactly as it might appear in last8Days
  const formatDateStr = (d) => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(d);

      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const dd = parts.find((p) => p.type === "day")?.value;

      if (y && m && dd) return `${y}-${m}-${dd}`;
    } catch (e) {
      // Fallback
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const getDayColorClass = (dateStr) => {
    const last8Days = customer?.last8Days || {};
    const entry = last8Days[dateStr];
    
    if (!entry) return "bg-red-100 text-red-800 border-red-300"; // Missing entries in past are treated as pending/red

    const status = String(typeof entry === "string" ? entry : entry?.status || "").trim().toLowerCase();
    
    if (status === "delivered") return "bg-green-100 text-green-800 border-green-300"; // Green
    if (["checked", "reached", "price_mismatch", "stock_available", "other_vendor", "shop_closed"].includes(status)) return "bg-yellow-100 text-yellow-800 border-yellow-300"; // Orange
    
    return "bg-red-100 text-red-800 border-red-300"; // Red for pending/others
  };

  // Close when clicking outside
  // We no longer need the backdrop click handler since we will use document click listener in the parent

  return (
    <div 
      className="absolute right-0 top-full mt-2 z-50 bg-white rounded-lg shadow-2xl border border-gray-300 w-72 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between items-center p-3 border-b bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">
            {headerText}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-black transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-3">
          <div className="text-center font-semibold mb-3 text-gray-800 text-sm border-b pb-2">
            {customer?.name || customer?.customerName || "Customer"}
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="font-bold text-gray-700 text-sm">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="p-2"></div>
            ))}
            
            {last30Days.map((d, i) => {
              const day = d.getDate();
              const dateStr = formatDateStr(d);
              const colorClass = getDayColorClass(dateStr);
              
              return (
                <div 
                  key={i} 
                  title={dateStr}
                  className={`p-1.5 rounded-sm border flex items-center justify-center text-xs font-bold shadow-sm transition-transform hover:scale-105 ${colorClass}`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
};

export default ExecutionCalendarModal;
