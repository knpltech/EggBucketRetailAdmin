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
    let serviceAccount;
    const serviceAccountPath = path.join(__dirname, "inventory-service-account.json");
    
    // Check if the service account is provided via an environment variable (for deployment)
    if (process.env.INVENTORY_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.INVENTORY_SERVICE_ACCOUNT_JSON);
    } 
    // Fallback to local file for development
    else if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    }

    if (serviceAccount) {
      inventoryAppInstance = admin.initializeApp(
        {
          credential: admin.credential.cert(serviceAccount),
        },
        "inventoryApp"
      );
      console.log("Successfully initialized Inventory Management Firebase App.");
    } else {
      console.warn("Inventory Management service account not found. Please provide INVENTORY_SERVICE_ACCOUNT_JSON env variable or the local JSON file.");
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
