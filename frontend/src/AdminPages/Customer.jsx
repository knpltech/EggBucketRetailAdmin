import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FiArrowLeft,
  FiDownload,
  FiMapPin,
  FiCalendar,
  FiTruck,
  FiPhone,
} from "react-icons/fi";
const GOOGLE_MAP_KEY = import.meta.env.VITE_GOOGLE_MAP_KEY;
const CHECKED_TYPES = [
  "reached",
  "price_mismatch",
  "shop_closed",
  "stock_available",
  "other_vendor",
];

const getDeliveryStatusKey = (delivery) => {
  const apiStatus = String(delivery?.status || "")
    .trim()
    .toLowerCase();

  if (["delivered", "checked", "pending"].includes(apiStatus)) {
    return apiStatus;
  }

  const type = String(delivery?.type || "")
    .trim()
    .toLowerCase();

  if (type === "delivered") return "delivered";
  if (CHECKED_TYPES.includes(type)) return "checked";

  return "pending";
};

const getDeliveryStatusLabel = (delivery) => {
  const key = getDeliveryStatusKey(delivery);

  if (key === "delivered") return "Delivered";
  if (key === "checked") return "Checked";

  return "Pending";
};

const getDeliveryReason = (delivery) =>
  delivery?.reason || delivery?.checkReason || "";

const parseTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    let normalized = value.trim().replace(/\u202f/g, " ");
    let date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date;

    const regex = /^(.+?)\s+at\s+(.+?)\s+UTC([+-]\d{1,2}:\d{2})$/i;
    const match = normalized.match(regex);
    if (match) {
      const [, datePart, timePart, offset] = match;
      const candidate = `${datePart} ${timePart} ${offset}`;
      date = new Date(candidate);
      if (!Number.isNaN(date.getTime())) return date;

      const candidate2 = `${datePart} ${timePart} GMT${offset}`;
      date = new Date(candidate2);
      if (!Number.isNaN(date.getTime())) return date;
    }

    // Fallback: remove 'at' and UTC prefix if still failing.
    normalized = normalized.replace(/\s+at\s+/i, " ").replace(/\s+UTC/, " ");
    date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (typeof seconds === "number") {
      const ms = seconds * 1000 + Math.floor(nanoseconds / 1e6);
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
};

const getDeliveryTimestamp = (delivery, last8Entry = {}) => {
  return (
    parseTimestamp(last8Entry.time) ||
    parseTimestamp(delivery?.time) ||
    parseTimestamp(delivery?.timestamp)
  );
};

const buildDeliveriesFromLast8Days = (customer) => {
  if (!customer?.last8Days) return [];

  return Object.entries(customer.last8Days)
    .map(([date, entry]) => {
      if (!entry || typeof entry === "string") return null;

      const status = String(entry.status || entry.type || "")
        .trim()
        .toLowerCase();
      const deliveryMan =
        typeof entry.deliveryMan === "object"
          ? entry.deliveryMan
          : entry.agentName
            ? { name: entry.agentName, phone: "" }
            : entry.deliveryMan
              ? { name: entry.deliveryMan, phone: "" }
              : null;

      return {
        id: date,
        timestamp: entry.time ?? entry.timestamp ?? null,
        type: status || "pending",
        status: status || "pending",
        checkReason: entry.checkReason || entry.reason || "",
        traysDelivered:
          typeof entry.quantity === "number" ? entry.quantity : null,
        deliveryMan,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = parseTimestamp(a.timestamp)?.getTime();
      const bTime = parseTimestamp(b.timestamp)?.getTime();

      if (aTime == null && bTime == null) return 0;
      if (aTime == null) return 1;
      if (bTime == null) return -1;

      return bTime - aTime;
    });
};

// Component to display information of particular customer
const Customer = () => {
  // Obtain customer id from parameters
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const prefetchedCustomer = location.state?.customer || null;

  const [customer, setCustomer] = useState(prefetchedCustomer);
  const [deliveries, setDeliveries] = useState([]);
  const [loadingCustomer, setLoadingCustomer] = useState(!prefetchedCustomer);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState("");
  const [showFullImage, setShowFullImage] = useState(false);
  const [reasonError, setReasonError] = useState("");

  const formatTrayLabel = (value) => {
    const trays = Number(value);
    if (!Number.isFinite(trays) || trays < 1) return "";
    if (trays >= 10) return "10+ trays";
    return trays === 1 ? "1 tray" : `${trays} trays`;
  };

  // Fetch basic customer info on page load
  useEffect(() => {
    let isMounted = true;

    const fetchCustomer = async () => {
      if (prefetchedCustomer?.id === id) {
        setLoadingCustomer(false);
        return;
      }

      setError(
        "Customer data is unavailable. Please open this page from the customer list.",
      );
      setLoadingCustomer(false);
    };

    setError("");
    setReasonError("");
    setCustomer(prefetchedCustomer?.id === id ? prefetchedCustomer : null);
    setDeliveries([]);
    setLoadingCustomer(!prefetchedCustomer || prefetchedCustomer.id !== id);
    setLoadingDeliveries(false);
    setShowHistory(false);
    setHistoryLoaded(false);

    fetchCustomer();

    return () => {
      isMounted = false;
    };
  }, [id, prefetchedCustomer]);

  const handleShowHistory = async () => {
    if (showHistory || loadingDeliveries) return;

    setShowHistory(true);
    await loadDeliveries();
  };

  const loadDeliveries = async () => {
    if (historyLoaded) {
      return deliveries;
    }

    setReasonError("");
    setLoadingDeliveries(true);

    try {
      if (!customer) {
        setReasonError("Customer data is unavailable.");
        return null;
      }

      const nextDeliveries = buildDeliveriesFromLast8Days(customer);
      setDeliveries(nextDeliveries);
      setHistoryLoaded(true);
      return nextDeliveries;
    } finally {
      setLoadingDeliveries(false);
    }
  };

  // Download csv file of customer deliveries
  const handleDownloadCSV = (sourceDeliveries = deliveries) => {
    if (!sourceDeliveries.length) return;

    const rows = sourceDeliveries.map((delivery) => {
      const last8Entry = customer?.last8Days?.[delivery.id] || {};
      const dateObj = getDeliveryTimestamp(delivery, last8Entry);
      const date = dateObj ? dateObj.toLocaleDateString() : "";
      const time = dateObj ? dateObj.toLocaleTimeString() : "";

      return {
        Date: date,
        Time: time,
        "Delivered By": delivery.deliveryMan?.name || "N/A",
        Phone: delivery.deliveryMan?.phone || "N/A",
        Status: getDeliveryStatusLabel(delivery),
        "Checked Reason": getDeliveryReason(delivery),
        "Trays Delivered": delivery.traysDelivered ?? "",
      };
    });

    const headers = Object.keys(rows[0]).join(",");
    const csv = [
      headers,
      ...rows.map((row) => Object.values(row).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `delivery_history_${customer.name || "customer"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadWithFetch = async () => {
    let sourceDeliveries = deliveries;

    if (!historyLoaded) {
      const loadedDeliveries = await loadDeliveries();
      if (!loadedDeliveries?.length) return;
      sourceDeliveries = loadedDeliveries;
    }

    handleDownloadCSV(sourceDeliveries);
  };



  // Function to parse latitude and longitude from a location string like "Lat: XX, Lng: YY"
  const parseLatLng = (locationString) => {
    // Regex to capture numeric latitude and longitude values from the string
    const match = locationString.match(/Lat:\s*([\d.-]+),\s*Lng:\s*([\d.-]+)/);
    if (match) {
      return {
        lat: match[1],
        lng: match[2],
      };
    }
    // Return null if parsing fails
    return null;
  };

  // Display a loading UI while the data is being fetched
  if (loadingCustomer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-blue-100 rounded-full mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-48"></div>
        </div>
      </div>
    );
  }

  // Display an error message if there is an error or the customer data is not found
  if (error || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border-l-4 border-red-500 p-6 max-w-md rounded-lg shadow-sm">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-8 w-8 text-red-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-red-800">
                Error loading customer
              </h3>
              <p className="text-sm text-red-700 mt-1">
                {error || "Customer not found."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Parse latitude and longitude from customer's location string
  const latLng = parseLatLng(customer.location);

  // Generate a static map image URL from Google Maps Static API if coordinates are available
  const mapUrl = latLng
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${latLng.lat},${latLng.lng}&zoom=15&size=600x300&markers=color:red%7C${latLng.lat},${latLng.lng}&key=${GOOGLE_MAP_KEY}`
    : null;

  // Generate a Google Maps search link for the parsed coordinates
  const mapsLink = latLng
    ? `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`
    : null;
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-6"
        >
          <FiArrowLeft className="mr-2" />
          <span className="font-medium">Back to Customers</span>
        </button>

        {/* Customer Card */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
          {/* Customer Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {customer.name}
                </h1>
                <p className="text-purple-100">{customer.business}</p>
              </div>
              <div className="mt-4 sm:mt-0">
                <img
                  src={customer.imageUrl}
                  alt={customer.name}
                  loading="eager"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-full border-4 border-white shadow-md cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setShowFullImage(true)}
                />
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    Contact Information
                  </h3>
                  <div className="mt-1 space-y-1">
                    <p className="text-lg font-medium text-gray-900 flex items-center">
                      <FiPhone className="mr-2 text-blue-500" />{" "}
                      {customer.phone}
                    </p>
                    <p className="text-sm text-gray-700">
                      Customer ID: {customer.custid}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    Created At
                  </h3>
                  <p className="mt-1 text-sm text-gray-900 flex items-center">
                    <FiCalendar className="mr-2 text-blue-500" />
                    {new Date(Number(customer.createdAt)).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </p>
                </div>
              </div>

              {/* Location Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 flex items-center">
                  <FiMapPin className="mr-2 text-blue-500" /> Location
                </h3>
                <p className="mt-1 text-sm text-gray-900 mb-4">
                  {customer.location}
                </p>

                {latLng && mapUrl && (
                  <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                    <a
                      href={mapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={mapUrl}
                        alt="Google Map"
                        loading="lazy"
                        className="w-full h-48 object-cover hover:opacity-90 transition-opacity"
                      />
                      <div className="bg-gray-50 px-4 py-2 text-center">
                        <p className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center justify-center">
                          <FiMapPin className="mr-1" /> Open in Google Maps
                        </p>
                      </div>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery History */}
            <div className="mt-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">
                  Delivery History
                </h3>
                <div className="mt-2 sm:mt-0 flex items-center gap-2">
                  <button
                    onClick={handleShowHistory}
                    disabled={showHistory || loadingDeliveries}
                    className="inline-flex items-center px-4 py-2 border border-blue-200 text-sm font-medium rounded-md shadow-sm text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 transition-colors"
                  >
                    {showHistory ? "History Shown" : "Show History"}
                  </button>
                  <button
                    onClick={handleDownloadWithFetch}
                    disabled={loadingDeliveries}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-60 transition-colors"
                  >
                    <FiDownload className="-ml-1 mr-2" />
                    Download CSV
                  </button>

                </div>
              </div>

              {!showHistory ? (
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <p className="text-sm text-gray-600">
                    Delivery history is hidden by default to load this page faster.
                  </p>
                </div>
              ) : loadingDeliveries ? (
                <div className="bg-gray-50 rounded-lg p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 w-48 bg-gray-200 rounded"></div>
                    <div className="h-16 w-full bg-gray-200 rounded"></div>
                    <div className="h-16 w-full bg-gray-200 rounded"></div>
                    <div className="h-16 w-full bg-gray-200 rounded"></div>
                  </div>
                </div>
              ) : deliveries.length > 0 ? (
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <ul className="divide-y divide-gray-200">
                    {deliveries.map((delivery) => {
                      const last8Entry = customer?.last8Days?.[delivery.id] || {};
                      const deliveryDate = getDeliveryTimestamp(delivery, last8Entry);
                      const statusKey = getDeliveryStatusKey(delivery);
                      const canEditReason =
                        String(delivery.type || "")
                          .trim()
                          .toLowerCase() === "reached";
                      return (
                        <li
                          key={delivery.id}
                          className="p-4 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center">
                              <div
                                className={`flex-shrink-0 h-3 w-3 rounded-full ${
                                  statusKey === "delivered"
                                    ? "bg-green-500"
                                    : statusKey === "checked"
                                      ? "bg-yellow-500"
                                      : "bg-gray-400"
                                }`}
                              ></div>
                              <div className="ml-4">
                                <p className="text-sm font-medium text-gray-900 flex items-center">
                                  <FiCalendar className="mr-2 text-blue-500" />
                                  {deliveryDate ? deliveryDate.toLocaleDateString() : "-"} at{" "}
                                  {deliveryDate ? deliveryDate.toLocaleTimeString() : "-"}
                                </p>
                                {delivery.deliveryMan ? (
                                  <p className="text-sm text-gray-500 flex items-center">
                                    <FiTruck className="mr-2 text-blue-500" />
                                    Delivered by {delivery.deliveryMan.name}
                                    {delivery.deliveryMan.phone
                                      ? ` (${delivery.deliveryMan.phone})`
                                      : ""}
                                  </p>
                                ) : (
                                  <p className="text-sm text-gray-500">
                                    Delivery person info not available
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 sm:mt-0 sm:min-w-[220px] flex flex-col sm:items-end">
                              <span
                                className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  statusKey === "delivered"
                                    ? "bg-green-100 text-green-800"
                                    : statusKey === "checked"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {getDeliveryStatusLabel(delivery)}
                              </span>
                              {statusKey === "checked" && (
                                <div className="mt-2 self-end">
                                  <p className="text-sm text-gray-700 text-right">
                                    {getDeliveryReason(delivery) || "-"}
                                  </p>
                                </div>
                              )}
                              {delivery.type === "delivered" && (
                                <div className="mt-2 self-end">
                                  <p className="text-sm text-gray-700 text-right">
                                    {Number.isInteger(delivery.traysDelivered) &&
                                    delivery.traysDelivered > 0
                                      ? formatTrayLabel(delivery.traysDelivered)
                                      : Number.isInteger(
                                          customer?.last8Days?.[delivery.id]?.quantity,
                                        ) &&
                                        customer.last8Days[delivery.id].quantity > 0
                                      ? formatTrayLabel(
                                          customer.last8Days[delivery.id].quantity,
                                        )
                                      : "-"}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No delivery history
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    No deliveries found for this customer.
                  </p>
                </div>
              )}
              {reasonError && (
                <p className="mt-3 text-sm text-red-600">{reasonError}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full Image Modal */}
      {showFullImage && (
        <div className="fixed inset-0 z-50 overflow-y-auto backdrop-blur-sm">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">
              &#8203;
            </span>
            <div className="inline-block align-bottom bg-purple-200 rounded-lg overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="absolute top-0 right-0 pt-4 pr-4">
                <button
                  onClick={() => setShowFullImage(false)}
                  className="bg-black rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <img
                  src={customer.imageUrl}
                  alt="Full Size"
                  className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customer;
