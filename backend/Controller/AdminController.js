import admin from 'firebase-admin';
import { getFirestore } from "firebase-admin/firestore"

const login = async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const db = getFirestore();
        const docRef = db.collection('Authentication').doc(role);
        const doc = await docRef.get();
        if (!doc.exists) {
        return res.status(404).json({ message: 'Role not found' });
        }

        const userData = doc.data();

        if (userData.username === username && userData.password === password) {
        return res.status(200).json({ message: 'Login successful' });
        }

        return res.status(401).json({ message: 'Invalid username or password' });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

const userInfo = async (req, res) => {
    try {
        const db = getFirestore();
        const customersSnapshot = await db.collection('customers').get();
        const customers = [];

        for (const doc of customersSnapshot.docs) {
            const customerData = doc.data();
            const deliveriesSnapshot = await db
                .collection('customer')
                .doc(doc.id)
                .collection('deliveries')
                .get();

            const deliveries = deliveriesSnapshot.docs.map(deliveryDoc => ({
                id: deliveryDoc.id,
                ...deliveryDoc.data()
            }));

            customers.push({
                id: doc.id,
                ...customerData,
                deliveries
            });
        }
        res.status(200).json(customers);
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Failed to fetch customer data' });
    }
};

const addDeliveryPartner = async (req, res) => {
  try {
    const { name, password } = req.body;
    console.log("Add delivery: ", name, password);
    if (!name || !password) {
      return res.status(400).json({ message: 'Name and password are required.' });
    }

    const db = getFirestore();

    const newPartnerRef = db.collection('DeliveryMan').doc();
    await newPartnerRef.set({ name, password });

    res.status(201).json({ message: 'Delivery partner added successfully.' });
  } catch (err) {
    console.error('Error adding delivery partner:', err);
    res.status(500).json({ message: 'Server error while adding delivery partner.' });
  }
};


const addSalesPerson = async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ message: 'Name and password are required.' });
    }

    const db = getFirestore();

    const newPartnerRef = db.collection('Salesman').doc();
    await newPartnerRef.set({ name, password });

    res.status(201).json({ message: 'Delivery partner added successfully.' });
  } catch (err) {
    console.error('Error adding delivery partner:', err);
    res.status(500).json({ message: 'Server error while adding delivery partner.' });
  }
};

export {         
    login,
    userInfo,
    addDeliveryPartner,
    addSalesPerson
};
