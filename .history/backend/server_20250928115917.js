import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";
// import cors from "cors";

import adminRouter from "./Routes/AdminRoutes.js";

// Load environment variables
dotenv.config();

// Initialize Firebase Admin SDK
// Validate required Firebase env vars before initializing
const requiredEnv = [
  'TYPE',
  'PROJECT_ID',
  'PRIVATE_KEY_ID',
  'PRIVATE_KEY',
  'CLIENT_EMAIL',
  'CLIENT_ID',
  'AUTH_URI',
  'TOKEN_URI',
  'AUTH_PROVIDER_X509_CERT_URL',
  'CLIENT_X509_CERT_URL',
  'STORAGE_BUCKET',
];

const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required environment variables for Firebase Admin:', missing.join(', '));
  console.error('Server will exit. Provide the missing variables in your .env file or environment.');
  process.exit(1);
}

// Replace escaped newlines in PRIVATE_KEY
const privateKey = process.env.PRIVATE_KEY.includes('\\n')
  ? process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
  : process.env.PRIVATE_KEY;

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.TYPE,
    project_id: process.env.PROJECT_ID,
    private_key_id: process.env.PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.CLIENT_EMAIL,
    client_id: process.env.CLIENT_ID,
    auth_uri: process.env.AUTH_URI,
    token_uri: process.env.TOKEN_URI,
    auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
    universe_domain: 'googleapis.com',
  }),
  storageBucket: process.env.STORAGE_BUCKET,
});

const app = express();


// app.use(cors());
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
