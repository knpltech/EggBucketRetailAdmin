import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import axios from "axios";
import App from "./App";
import "./index.css";

const clearAuthAndRedirect = () => {
  localStorage.removeItem("loggedIn");
  localStorage.removeItem("userType");
  localStorage.removeItem("authToken");

  if (window.location.pathname !== "/") {
    window.location.href = "/";
  }
};

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("authToken");

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthAndRedirect();
    }
    return Promise.reject(error);
  },
);

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const token = localStorage.getItem("authToken");
  const headers = new Headers(init.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await nativeFetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearAuthAndRedirect();
  }

  return response;
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
