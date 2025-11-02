import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

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

async function checkCustomerImages() {
  const db = getFirestore();
  const customersSnapshot = await db.collection('customers').limit(5).get();
  
  console.log('Sample customer data:\n');
  customersSnapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log('Customer:', data.name);
    console.log('Image URL:', data.imageUrl || 'NO IMAGE URL');
    console.log('---');
  });
  
  process.exit(0);
}

checkCustomerImages();
