import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
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

async function listFiles() {
  try {
    const bucket = getStorage().bucket();
    console.log(`Bucket name: ${bucket.name}\n`);
    
    console.log('Listing files in Customer folder...\n');
    const [files] = await bucket.getFiles({ prefix: 'Customer/' });
    
    console.log(`Found ${files.length} files:\n`);
    files.slice(0, 10).forEach(file => {
      console.log(`- ${file.name}`);
    });
    
    if (files.length > 10) {
      console.log(`\n... and ${files.length - 10} more files`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

listFiles();
