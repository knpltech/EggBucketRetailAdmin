import axios from "axios";
import { getFirestore } from "firebase-admin/firestore";
import { signAuthToken } from "../utils/jwt.js";

// In-memory rate limiting tracking
const phoneRequestHistory = new Map(); // cleanPhone -> [timestamp]
const ipRequestHistory = new Map();    // clientIp -> [timestamp]
const verifyAttempts = new Map();     // sessionId -> count

// Handles user login with username, password, and role (Admin dashboard)
const login = async (req, res) => {
  const { username, password, role } = req.body || {};
  try {
    const db = getFirestore();
    const docRef = db.collection("Authentication").doc(role);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Role not found" });
    }

    const userData = doc.data();

    if (userData.username === username && userData.password === password) {
      const token = signAuthToken({ role, username });
      return res.status(200).json({
        message: "Login successful",
        token,
        role,
      });
    }

    return res.status(401).json({ message: "Invalid username or password" });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Send Voice OTP via 2Factor.in for customer mobile app with strict rate limiting
const sendVoiceOtp = async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    // Clean phone number to 10 digits
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: "Invalid 10-digit phone number" });
    }

    const now = Date.now();

    // 1. IP Abuse Limit: max 10 requests per hour per IP
    const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    const ipHistory = ipRequestHistory.get(clientIp) || [];
    const recentIp1h = ipHistory.filter(t => now - t < 60 * 60 * 1000);
    if (recentIp1h.length >= 10) {
      return res.status(429).json({
        success: false,
        message: "Too many requests from this network. Please try again later."
      });
    }

    // 2. Per-phone Rate Limits
    const phoneHistory = phoneRequestHistory.get(cleanPhone) || [];
    const recent24h = phoneHistory.filter(t => now - t < 24 * 60 * 60 * 1000);

    // Rule A: Resend voice OTP to the same phone: Wait 60 seconds
    const lastRequestTime = recent24h[recent24h.length - 1];
    if (lastRequestTime && now - lastRequestTime < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (now - lastRequestTime)) / 1000);
      return res.status(429).json({ success: false, message: "Please wait " + waitSec + " seconds before requesting another voice OTP call." });
    }

    // Rule B: OTP requests per phone: 3 per 15 minutes
    const recent15m = recent24h.filter(t => now - t < 15 * 60 * 1000);
    if (recent15m.length >= 3) {
      return res.status(429).json({ success: false, message: "Too many OTP requests. Maximum 3 requests allowed per 15 minutes. Please wait before retrying." });
    }

    // Rule C: OTP requests per phone: 5 per 24 hours
    if (recent24h.length >= 5) {
      return res.status(429).json({ success: false, message: "Daily OTP limit reached (maximum 5 requests per 24 hours). Please try again tomorrow." });
    }

    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) {
      console.error("TWO_FACTOR_API_KEY is not configured in .env");
      return res.status(500).json({ success: false, message: "Voice OTP service not configured (missing TWO_FACTOR_API_KEY in backend .env)" });
    }

    const twoFactorUrl = "https://2factor.in/API/V1/" + apiKey + "/VOICE/" + cleanPhone + "/AUTOGEN";
    console.log("[2Factor] Initiating voice OTP call to +91" + cleanPhone + " from IP: " + clientIp + "...");

    const response = await axios.get(twoFactorUrl, { timeout: 15000 });

    if (response.data && response.data.Status === "Success") {
      console.log("[2Factor] Voice OTP call triggered successfully. Session: " + response.data.Details);

      recent24h.push(now);
      phoneRequestHistory.set(cleanPhone, recent24h);

      recentIp1h.push(now);
      ipRequestHistory.set(clientIp, recentIp1h);

      return res.status(200).json({
        success: true,
        sessionId: response.data.Details,
        message: "Voice OTP call initiated successfully"
      });
    } else {
      console.error("[2Factor] API error response:", response.data);
      return res.status(400).json({
        success: false,
        message: response.data?.Details || "Failed to trigger voice OTP call"
      });
    }
  } catch (error) {
    const errDetails = error?.response?.data?.Details || error?.response?.data?.message || error.message;
    console.error("[2Factor] Voice OTP exception:", errDetails);
    return res.status(500).json({
      success: false,
      message: errDetails || "Failed to connect to Voice OTP service"
    });
  }
};

// Verify Voice OTP entered by customer with attempt limit (max 5 attempts)
const verifyVoiceOtp = async (req, res) => {
  try {
    const { sessionId, otp } = req.body || {};
    if (!sessionId || !otp) {
      return res.status(400).json({ success: false, message: "Session ID and OTP are required" });
    }

    // Rule D: OTP verification attempts per OTP: 5 attempts
    const attempts = (verifyAttempts.get(sessionId) || 0) + 1;
    verifyAttempts.set(sessionId, attempts);

    if (attempts > 5) {
      return res.status(429).json({
        success: false,
        message: "Maximum verification attempts (5) exceeded. Please request a new OTP call."
      });
    }

    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Voice OTP service not configured (missing TWO_FACTOR_API_KEY in backend .env)"
      });
    }

    const cleanOtp = String(otp).trim();
    const verifyUrl = "https://2factor.in/API/V1/" + apiKey + "/VOICE/VERIFY/" + sessionId + "/" + cleanOtp;
    console.log("[2Factor] Verifying OTP (attempt " + attempts + "/5) for session: " + sessionId + "...");

    const response = await axios.get(verifyUrl, { timeout: 15000 });

    if (
      response.data &&
      response.data.Status === "Success" &&
      (response.data.Details === "OTP Matched" || (typeof response.data.Details === "string" && response.data.Details.toLowerCase().includes("matched")))
    ) {
      console.log("[2Factor] OTP matched successfully for session: " + sessionId);
      verifyAttempts.delete(sessionId);
      return res.status(200).json({
        success: true,
        message: "OTP verified successfully"
      });
    } else {
      console.warn("[2Factor] OTP verification failed:", response.data);
      const remaining = 5 - attempts;
      const attemptNote = remaining > 0 ? (" (" + remaining + " attempt" + (remaining > 1 ? "s" : "") + " left)") : " (No attempts left. Please request a new OTP)";
      return res.status(400).json({
        success: false,
        message: (response.data?.Details || "Invalid or expired OTP.") + attemptNote
      });
    }
  } catch (error) {
    const errDetails = error?.response?.data?.Details || error?.response?.data?.message || error.message;
    console.error("[2Factor] Verification exception{", errDetails);
    return res.status(400).json({
      success: false,
      message: errDetails || "OTP verification failed. Please try again."
    });
  }
};

export { login, sendVoiceOtp, verifyVoiceOtp };