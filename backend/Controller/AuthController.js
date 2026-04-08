import { getFirestore } from "firebase-admin/firestore";
import { signAuthToken } from "../utils/jwt.js";

// Handles user login with username, password, and role
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

export { login };
