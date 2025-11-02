import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

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

async function makeAllImagesPublic() {
  try {
    const db = getFirestore();
    const bucket = getStorage().bucket();
    
    console.log('Fetching all customers...');
    const customersSnapshot = await db.collection('customers').get();
    
    console.log(`Found ${customersSnapshot.size} customers`);
    
    let updatedCount = 0;
    
    for (const doc of customersSnapshot.docs) {
      const customerData = doc.data();
      const imageUrl = customerData.imageUrl;
      
      if (imageUrl) {
        try {
          let fileName = null;
          
          // Handle different URL formats
          if (imageUrl.includes('firebasestorage.googleapis.com')) {
            // Format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/Customer%2Ffile.jpg?...
            const match = imageUrl.match(/\/o\/(.*?)\?/);
            if (match) {
              fileName = decodeURIComponent(match[1]);
            }
          } else if (imageUrl.includes('storage.googleapis.com')) {
            // Format: https://storage.googleapis.com/BUCKET/Customer/file.jpg
            const parts = imageUrl.split(`${bucket.name}/`);
            if (parts[1]) {
              fileName = parts[1].split('?')[0]; // Remove query params if any
            }
          }
          
          if (fileName) {
            console.log(`Processing: ${customerData.name} - ${fileName}`);
            const file = bucket.file(fileName);
            
            const [exists] = await file.exists();
            if (exists) {
              await file.makePublic();
              
              // Generate new public URL
              const newPublicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
              
              // Update Firestore with new URL
              await db.collection('customers').doc(doc.id).update({
                imageUrl: newPublicUrl
              });
              
              console.log(`✓ Updated: ${customerData.name}`);
              updatedCount++;
            } else {
              console.log(`✗ File not found: ${fileName}`);
            }
          }
        } catch (error) {
          console.error(`Error processing ${customerData.name}:`, error.message);
        }
      }
    }
    
    console.log(`\nUpdated ${updatedCount} out of ${customersSnapshot.size} customers.`);
    
    console.log('\nDone! All existing images should now be public.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

makeAllImagesPublic();
