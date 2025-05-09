// admin.js
import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";

// Get all customers
export async function getCustomers() {
  const q = query(collection(db, "customers"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Add new delivery partner
export async function addDeliveryPartner(name, phone, email, password) {
  const userData = {
    name,
    phone,
    role: 'delivery'
  };
  
  return await registerUser(email, password, 'delivery', userData);
}

// Add new sales person
export async function addSalesPerson(name, phone, email, password) {
  const userData = {
    name,
    phone,
    role: 'sales'
  };
  
  return await registerUser(email, password, 'sales', userData);
}

// Get all personnel (delivery and sales)
export async function getAllPersonnel() {
  const deliveryQuery = query(collection(db, "users"), where("role", "==", "delivery"));
  const salesQuery = query(collection(db, "users"), where("role", "==", "sales"));
  
  const [deliverySnapshot, salesSnapshot] = await Promise.all([
    getDocs(deliveryQuery),
    getDocs(salesQuery)
  ]);
  
  return {
    delivery: deliverySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    sales: salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  };
}
// Run this in your Firebase Cloud Functions or Firebase CLI
const admin = require('firebase-admin');
admin.initializeApp();

async function setAdminClaims(uid) {
  try {
    await admin.auth().setCustomUserClaims(uid, {
      admin: true,
      retail: false
    });
    console.log(`Custom claims set for ${uid}`);
  } catch (error) {
    console.error('Error setting custom claims:', error);
  }
}

// Call with the UID you noted earlier
setAdminClaims('Vyxi5mHjwhTrus3ATbgH0dZBsJu1');