import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let initialized = false;
let inventoryAppInstance = null;

export const initializeFirebaseAdmin = () => {
  if (initialized) return;

  // Initialize primary (default) app
  admin.initializeApp({
    credential: admin.credential.cert({
      type: process.env.TYPE,
      project_id: process.env.PROJECT_ID,
      private_key_id: process.env.PRIVATE_KEY_ID,
      private_key: process.env.PRIVATE_KEY?.replace(/\\n/g, "\n"),
      client_email: process.env.CLIENT_EMAIL,
      client_id: process.env.CLIENT_ID,
      auth_uri: process.env.AUTH_URI,
      token_uri: process.env.TOKEN_URL,
      auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
      universe_domain: "googleapis.com",
    }),
    storageBucket: process.env.STORAGE_BUCKET,
  });

  // Initialize secondary (Inventory Management) app
  try {
    const serviceAccountPath = path.join(__dirname, "inventory-service-account.json");
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      inventoryAppInstance = admin.initializeApp(
        {
          credential: admin.credential.cert(serviceAccount),
        },
        "inventoryApp"
      );
      console.log("Successfully initialized Inventory Management Firebase App.");
    } else {
      console.warn("Inventory Management service account JSON not found at", serviceAccountPath);
    }
  } catch (error) {
    console.error("Failed to initialize Inventory Management Firebase App:", error);
  }

  initialized = true;
};

export const getInventoryApp = () => {
  if (!initialized) {
    initializeFirebaseAdmin();
  }
  return inventoryAppInstance;
};

export default admin;
