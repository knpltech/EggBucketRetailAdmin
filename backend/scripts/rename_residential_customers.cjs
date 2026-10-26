const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const admin = require("firebase-admin");

if (!admin.apps.length) {
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
}

const db = admin.firestore();

async function renameResidentialCustomers() {
  console.log("=== Checking customers & businessTypes for 'Residencial Customers' ===");

  try {
    // 1. Check and update businessTypes collection
    const btSnap = await db.collection("businessTypes").get();
    let hasCorrectBt = false;
    const misspelledBtDocs = [];

    btSnap.forEach((doc) => {
      const name = String(doc.data()?.name || "").trim();
      if (name.toLowerCase() === "residential customers") {
        hasCorrectBt = true;
      }
      if (name.toLowerCase().includes("residencial")) {
        misspelledBtDocs.push(doc);
      }
    });

    console.log(`Found ${misspelledBtDocs.length} misspelled businessTypes entry/entries.`);
    for (const doc of misspelledBtDocs) {
      if (!hasCorrectBt) {
        await doc.ref.update({ name: "Residential Customers" });
        console.log(`Updated businessType doc ${doc.id} to 'Residential Customers'`);
        hasCorrectBt = true;
      } else {
        await doc.ref.delete();
        console.log(`Removed duplicate misspelled businessType doc ${doc.id}`);
      }
    }

    if (!hasCorrectBt) {
      await db.collection("businessTypes").add({ name: "Residential Customers" });
      console.log("Added 'Residential Customers' to businessTypes collection");
    }

    // 2. Query customers collection
    const collectionsToCheck = ["customers", "customer"];
    let totalUpdated = 0;

    for (const colName of collectionsToCheck) {
      try {
        const snap = await db.collection(colName).get();
        console.log(`Scanning ${snap.docs.length} documents in '${colName}'...`);

        const batchSize = 400;
        let batch = db.batch();
        let batchCount = 0;

        for (const doc of snap.docs) {
          const data = doc.data() || {};
          const bt = String(data.businessType || "").trim();

          // Check if businessType is misspelled (e.g. "RESIDENCIAL CUSTOMERS", "Residencial Customers", etc.)
          if (bt.toLowerCase().includes("residencial") || bt.toLowerCase() === "residential customer") {
            batch.update(doc.ref, {
              businessType: "Residential Customers",
              updatedAt: Date.now(),
            });
            batchCount++;
            totalUpdated++;
            console.log(`[${colName}] Queued update for: ${data.name || doc.id} (Current: "${bt}")`);

            if (batchCount >= batchSize) {
              await batch.commit();
              console.log(`Committed batch of ${batchCount} updates in '${colName}'`);
              batch = db.batch();
              batchCount = 0;
            }
          }
        }

        if (batchCount > 0) {
          await batch.commit();
          console.log(`Committed final batch of ${batchCount} updates in '${colName}'`);
        }
      } catch (colErr) {
        console.warn(`Could not process collection '${colName}':`, colErr.message);
      }
    }

    console.log(`\n=== Migration Complete ===`);
    console.log(`Total customer documents updated to 'Residential Customers': ${totalUpdated}`);
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

renameResidentialCustomers().then(() => {
  console.log("Done.");
  process.exit(0);
});
