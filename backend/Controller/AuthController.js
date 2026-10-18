import axios from "axios";
import { getFirestore } from "firebase-admin/firestore";
import { signAuthToken } from "../utils/jwt.js";

// Handles user login with username, password, and role (Admin dashboard)
const login = async (req, res) => {
  const { username, password, role } = req.body;
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

// Send Voice OTP via 2Factor.in for customer mobile app
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

    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) {
      console.error("TWO_FACTOR_API_KEY is not configured in .env");
      return res.status(500).json({
        success: false,
        message: "Voice OTP service not configured (missing TWO_FACTOR_API_KEY in backend .env)"
      });
    }

    // 2Factor Voice OTP URL:
    // https://2factor.in/API/V1/{API_KEY}/VOICE/{PHONE_NUMBER}/AUTOGEN
    const twoFactorUrl = "https://2factor.in/API/V1/" + apiKey + "/VOICE/" + cleanPhone + "/AUTOGEN";
    console.log("[2Factor] Initiating voice OTP call to +91" + cleanPhone + "...");

    const response = await axios.get(twoFactorUrl, { timeout: 15000 });

    if (response.data && response.data.Status === "Success") {
      console.log("[2Factor] Voice OTP call triggered successfully. Session: " + response.data.Details);
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

// Verify Voice OTP entered by customer
const verifyVoiceOtp = async (req, res) => {
  try {
    const { sessionId, otp } = req.body || {};
    if (!sessionId || !otp) {
      return res.status(400).json({ success: false, message: "Session ID and OTP are required" });
    }

    const apiKey = process.env.TWO_FACTOR_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Voice OTP service not configured (missing TWO_FACTOR_API_KEY in backend .env)"
      });
    }

    const cleanOtp = String(otp).trim();
    // 2Factor Verification URL:
    // https://2factor.in/API/V1/{API_KEY}/VOICE/VERIFY/{SESSION_ID}/{OTP_VALUE}
    const verifyUrl = "https://2factor.in/API/V1/" + apiKey + "/VOICE/VERIFY/" + sessionId + "/" + cleanOtp;
    console.log("[2Factor] Verifying OTP for session: " + sessionId + "...");

    const response = await axios.get(verifyUrl, { timeout: 15000 });

    if (
      response.data &&
      response.data.Status === "Success" &&
      (response.data.Details === "OTP Matched" || (typeof response.data.Details === "string" && response.data.Details.toLowerCase().includes("matched")))
    ) {
      console.log("[2Factor] OTP matched successfully for session: " + sessionId);
      return res.status(200).json({
        success: true,
        message: "OTP verified successfully"
      });
    } else {
      console.warn("[2Factor] OTP verification failed:", response.data);
      return res.status(400).json({
        success: false,
        message: response.data?.Details || "Invalid or expired OTP. Please try again."
      });
    }
  } catch (error) {
    const errDetails = error?.response?.data?.Details || error?.response?.data?.message || error.message;
    console.error("[2Factor] Verification exception:", errDetails);
    return res.status(400).json({
      success: false,
      message: errDetails || "OTP verification failed. Please try again."
    });
  }
};

export { login, sendVoiceOtp, verifyVoiceOtp };
