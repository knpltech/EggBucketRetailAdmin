import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import "leaflet/dist/leaflet.css";

/*  SVG PIN ICONS */

const pin = (color) =>
  L.divIcon({
    className: "",
    html: `
      <svg width="34" height="34" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="3" fill="white"/>
      </svg>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });

const ICONS = {
  delivered: pin("#2ecc71"),
  reached: pin("#f39c12"),
  pending: pin("#e74c3c"),
};

/*  FIT BOUNDS COMPONENT  */

const FitBounds = ({ points, onReady }) => {
  const map = useMap();
  const hasRun = useRef(false); // important

  useEffect(() => {
    if (!points.length) return;

    // Run only once
    if (hasRun.current) return;

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));

    map.fitBounds(bounds, { padding: [50, 50] });

    if (onReady) onReady(bounds);

    hasRun.current = true; // lock it after first run
  }, [points, map, onReady]);

  return null;
};

/*  MAIN COMPONENT */

const CustomerMap = () => {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);

  const mapRef = useRef(null);
  const initialBoundsRef = useRef(null);

  useEffect(() => {
    axios
      .get(`${ADMIN_PATH}/customer-map-status?day=today`)
      .then((res) => setCustomers(res.data))
      .catch((err) => console.error("Map error:", err));
  }, []);

  /* RESET HANDLER */

  const handleReset = () => {
    setSelected(null);

    if (mapRef.current && initialBoundsRef.current) {
      mapRef.current.fitBounds(initialBoundsRef.current, {
        padding: [50, 50],
      });
    }
  };

  return (
    <>
      {/* STYLES */}
      <style>{`
        .leaflet-container {
          height: 100vh;
          width: 100%;
        }

        .reset-btn {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 1000;
          padding: 8px 18px;
          border-radius: 999px;
          border: none;
          background: white;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }

        .bottom-card {
          position: fixed;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          width: 95%;
          max-width: 420px;
          background: #fff;
          border-radius: 16px;
          padding: 14px;
          display: flex;
          gap: 14px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.3);
          z-index: 1000;
        }

        .bottom-card img {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          object-fit: cover;
        }

        .status.delivered { color: #2ecc71; font-weight: 700; }
        .status.reached { color: #f39c12; font-weight: 700; }
        .status.pending { color: #e74c3c; font-weight: 700; }
      `}</style>

      <button className="reset-btn" onClick={handleReset}>
        Reset
      </button>

      {/*MAP*/}
      <MapContainer
        center={[12.9716, 77.5946]}
        zoom={12}
        whenCreated={(map) => (mapRef.current = map)}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        <FitBounds
          points={customers}
          onReady={(bounds) => {
            initialBoundsRef.current = bounds;
          }}
        />

        {customers.map((c) => (
          <Marker
            key={c.id}
            position={[c.lat, c.lng]}
            icon={ICONS[c.status] || ICONS.pending}
            eventHandlers={{
              click: (e) => {
                e.originalEvent.stopPropagation(); // prevent any default map movement
                setSelected(c);
              },
            }}
          />
        ))}
      </MapContainer>

      {/*BOTTOM CARD*/}
      {selected && (
        <div className="bottom-card">
          <img src={selected.imageUrl || "/logo.png"} alt="" />
          <div>
            <div style={{ fontWeight: 700 }}>{selected.name}</div>
            <div>{selected.business}</div>
            <div style={{ fontSize: 12, color: "#555" }}>
              {selected.location}
            </div>
            <div className={`status ${selected.status}`}>
              Status: {selected.status.toUpperCase()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomerMap;
