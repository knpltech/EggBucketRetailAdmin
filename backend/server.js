import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import adminRouter from "./Routes/AdminRoutes.js";
import { initializeFirebaseAdmin } from "./config/firebaseAdmin.js";
import { startSkipDeliveryCron } from "./jobs/skipDeliveryCron.js";

dotenv.config();

const env = {
  port: Number(process.env.PORT || 3000),
  frontendOrigins:
    process.env.FRONTEND_ORIGINS ||
    process.env.FRONTEND_ORIGIN ||
    "https://egg-bucket-retail-admin.vercel.app,http://localhost:5173",
};

initializeFirebaseAdmin();
startSkipDeliveryCron();

const app = express();
// Enable CORS - support multiple origins via FRONTEND_ORIGINS (comma-separated)
const originsEnv = env.frontendOrigins;

const allowedOrigins = originsEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// normalize origins (strip trailing slash and lowercase) for robust matching
const normalize = (u) =>
  (u || "").toString().trim().replace(/\/$/, "").toLowerCase();
const normalizedAllowed = allowedOrigins.map(normalize);
console.log("Allowed CORS origins:", normalizedAllowed);

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) return callback(null, true);
      const normOrigin = normalize(origin);
      if (normalizedAllowed.indexOf(normOrigin) !== -1)
        return callback(null, true);
      console.warn("CORS: rejecting origin", origin);
      // don't throw error (which becomes 500); just deny CORS so browser will block the request
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("API is live");
});

// Routes related to admin
app.use("/api/admin", adminRouter);

const port = env.port;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
