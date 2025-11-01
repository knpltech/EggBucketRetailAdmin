import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";
import cors from "cors";

import adminRouter from "./Routes/AdminRoutes.js";

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.TYPE,
    project_id: process.env.PROJECT_ID,
    private_key_id: process.env.PRIVATE_KEY_ID,
    private_key: process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.replace(/\\n/g, "\n") : undefined,
    client_email: process.env.CLIENT_EMAIL,
    client_id: process.env.CLIENT_ID,
    auth_uri: process.env.AUTH_URI,
    token_uri: process.env.TOKEN_URI,
    auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
    universe_domain: "googleapis.com",
  }),
  storageBucket: process.env.STORAGE_BUCKET,
});

const app = express();
// Enable CORS - support multiple origins via FRONTEND_ORIGINS (comma-separated)
const originsEnv = process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || 'https://egg-bucket-retail-admin.vercel.app';
const allowedOrigins = originsEnv.split(',').map(s => s.trim()).filter(Boolean);
// normalize origins (strip trailing slash and lowercase) for robust matching
const normalize = (u) => (u || '').toString().trim().replace(/\/$/, '').toLowerCase();
const normalizedAllowed = allowedOrigins.map(normalize);
console.log('Allowed CORS origins:', normalizedAllowed);

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);
    const normOrigin = normalize(origin);
    if (normalizedAllowed.indexOf(normOrigin) !== -1) return callback(null, true);
    console.warn('CORS: rejecting origin', origin);
    // don't throw error (which becomes 500); just deny CORS so browser will block the request
    return callback(null, false);
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','Accept'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("API is live");
});

// Routes related to admin
app.use("/api/admin", adminRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
