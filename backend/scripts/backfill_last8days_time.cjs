require('dotenv').config();
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

async function backfillLast8DaysTime() {
  console.log("Starting backfill for last8Days time...");
  
  let processedCount = 0;
  let updatedCount = 0;
  
  try {
    const customersSnap = await db.collection("customers").get();
    
    // We use batches to write updates efficiently
    let batch = db.batch();
    let batchCount = 0;
    
    for (const doc of customersSnap.docs) {
      const data = doc.data();
      let needsUpdate = false;
      const last8Days = data.last8Days;
      
      if (last8Days && typeof last8Days === 'object') {
        // Find if any entry is missing the time field
        for (const [dateKey, entry] of Object.entries(last8Days)) {
          if (typeof entry === 'object' && entry !== null) {
            if (!entry.time) {
              needsUpdate = true;
              
              // Fallback priority:
              // 1. last8DaysUpdatedAt (best approximation of when the status was changed)
              // 2. Date.now() (fallback if no updated timestamp exists)
              entry.time = data.last8DaysUpdatedAt || Date.now();
            }
          } else if (typeof entry === 'string') {
            // Convert legacy string to object
            needsUpdate = true;
            last8Days[dateKey] = {
              status: entry,
              time: data.last8DaysUpdatedAt || Date.now()
            };
          }
        }
      }
      
      if (needsUpdate) {
        batch.update(doc.ref, { last8Days });
        batchCount++;
        updatedCount++;
        
        // Commit batch every 500 operations (Firestore limit)
        if (batchCount === 500) {
          await batch.commit();
          console.log(`Committed batch of 500 updates...`);
          batch = db.batch(); // Create a new batch
          batchCount = 0;
        }
      }
      
      processedCount++;
      if (processedCount % 1000 === 0) {
        console.log(`Processed ${processedCount} customers...`);
      }
    }
    
    // Commit any remaining updates
    if (batchCount > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${batchCount} updates.`);
    }
    
    console.log("-----------------------------------------");
    console.log(`✅ Backfill complete!`);
    console.log(`Total customers processed: ${processedCount}`);
    console.log(`Total customers updated: ${updatedCount}`);
    
  } catch (error) {
    console.error("Error running backfill script:", error);
  }
}

backfillLast8DaysTime()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
