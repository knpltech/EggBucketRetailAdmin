import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  getDeliveryGapNumber,
  getPeakFrequencyNumber,
  normalizeDeliveryGap,
  resolvePeakFrequency,
  getDateStringInTimeZone,
  computeDeliveryGap,
} from './aiSuggestionEngine';

/**
 * Export AI Suggestions to Excel
 * @param {Array} sortedData - The sorted and filtered data to export
 * @param {String} logicOption - The current logic option (logic1, logic2, logic3)
 */
export const exportToExcel = (sortedData, logicOption) => {
  if (!sortedData || sortedData.length === 0) {
    alert('No data to export');
    return;
  }

  // Transform data for Excel export
  const exportData = sortedData.map((item) => {
    const customer = item.customer;
    const suggestion = item.suggestion;
    const todayDate = getDateStringInTimeZone(new Date(), 'Asia/Kolkata');
    const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
    const deliveryGap = normalizeDeliveryGap(customer?.deliveryGap || rawDeliveryGap);

    return {
      'Customer ID': customer.custid || '',
      'Customer Name': customer.name || '',
      'Business': customer.business || '',
      'Phone': customer.phone || '',
      'Address': customer.address || '',
      'Peak Frequency': resolvePeakFrequency(customer) || '',
      'Potential': customer.potential || '',
      'Delivery Gap': deliveryGap || '',
      'Current Status': customer.todayOverride?.status || 'NOT SET',
      'AI Suggestion': suggestion.suggestion || '',
      'Confidence': suggestion.confidence || 0,
      'Reason': suggestion.reason || '',
      'Generated At': new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
      }),
    };
  });

  // Create a new workbook
  const ws = XLSX.utils.json_to_sheet(exportData);

  // Auto-fit column widths
  const colWidths = [
    { wch: 12 }, // Customer ID
    { wch: 20 }, // Customer Name
    { wch: 20 }, // Business
    { wch: 15 }, // Phone
    { wch: 30 }, // Address
    { wch: 15 }, // Peak Frequency
    { wch: 12 }, // Potential
    { wch: 15 }, // Delivery Gap
    { wch: 15 }, // Current Status
    { wch: 20 }, // AI Suggestion
    { wch: 12 }, // Confidence
    { wch: 30 }, // Reason
    { wch: 20 }, // Generated At
  ];
  ws['!cols'] = colWidths;

  // Create workbook and add worksheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'AI Suggestions');

  // Generate filename with logic and timestamp
  const timestamp = new Date()
    .toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(/[/:]/g, '-');

  const logicLabel = logicOption.charAt(0).toUpperCase() + logicOption.slice(1); // Logic1, Logic2, Logic3
  const filename = `AI-Suggestions-${logicLabel}-${timestamp}.xlsx`;

  // Save file
  XLSX.writeFile(wb, filename);
};
