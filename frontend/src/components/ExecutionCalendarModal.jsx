import React, { useMemo, useEffect, useState, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ExecutionCalendarModal = ({ customer, onClose, anchorRef, anchorEl }) => {
  const today = new Date();
  const popoverRef = useRef(null);
  const mountRef = useRef(null);
  const [coords, setCoords] = useState(null);

  // Position calculation relative to anchor button
  useLayoutEffect(() => {
    const getTarget = () => {
      if (anchorRef?.current) return anchorRef.current;
      if (anchorEl) return anchorEl;
      if (mountRef.current?.parentElement) {
        return (
          mountRef.current.parentElement.querySelector('button') ||
          mountRef.current.parentElement.querySelector('div') ||
          mountRef.current.parentElement
        );
      }
      return null;
    };

    const updatePosition = () => {
      const target = getTarget();
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const popoverHeight = 370;
      const popoverWidth = 288; // w-72 is 288px

      // Check if opening downward would overflow the viewport bottom
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < popoverHeight && rect.top > popoverHeight;

      const top = openUpward
        ? Math.max(10, rect.top - popoverHeight)
        : Math.min(window.innerHeight - popoverHeight - 10, rect.bottom + 4);

      // Align right edge with button right edge, bounded by window margins
      const right = Math.max(10, Math.min(window.innerWidth - popoverWidth - 10, window.innerWidth - rect.right));

      setCoords({ top, right });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, anchorEl]);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    const handlePointerDown = (e) => {
      const target = anchorRef?.current || anchorEl || mountRef.current?.parentElement;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        (!target || !target.contains(e.target))
      ) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [onClose, anchorRef, anchorEl]);
  
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
    if (["checked", "reached", "price_mismatch", "stock_available", "other_vendor", "shop_closed", "confirmed_tomorrow"].includes(status)) return "bg-yellow-100 text-yellow-800 border-yellow-300"; // Orange
    
    return "bg-red-100 text-red-800 border-red-300"; // Red for pending/others
  };

  const popover = (
    <div 
      ref={popoverRef}
      className="fixed z-[99999] bg-white rounded-lg shadow-2xl border border-gray-300 w-72 overflow-hidden text-left"
      style={{
        top: coords ? `${coords.top}px` : 'auto',
        right: coords ? `${coords.right}px` : '10px',
        visibility: coords ? 'visible' : 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between items-center p-3 border-b bg-gray-50">
        <h2 className="text-base font-bold text-gray-800">
          {headerText}
        </h2>
        <button 
          type="button"
          onClick={onClose} 
          className="text-gray-500 hover:text-black transition-colors p-0.5 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-3">
        <div className="text-center font-bold mb-3 text-gray-800 text-sm border-b pb-2">
          {customer?.name || customer?.customerName || "Customer"}
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="font-bold text-gray-700 text-xs">{d}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center">
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="p-1"></div>
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

  return (
    <>
      <span ref={mountRef} className="hidden" aria-hidden="true" />
      {typeof document !== 'undefined' ? createPortal(popover, document.body) : popover}
    </>
  );
};

export default ExecutionCalendarModal;
