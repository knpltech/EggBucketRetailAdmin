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

// Utility to delete a subcollection (since Firestore doesn't auto-delete subcollections)
const deleteSubcollection = async (parentDocRef, subcollectionName) => {
    const subcollectionSnapshot = await parentDocRef.collection(subcollectionName).get();

    const batch = getFirestore().batch();
    subcollectionSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
};

const deleteCustomer = async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ message: 'Customer ID is required' });
    }

    try {
        const db = getFirestore();
        const customerRef = db.collection('customers').doc(id);

        const customerDoc = await customerRef.get();

        if (!customerDoc.exists) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Optionally delete subcollections (like 'deliveries')
        // await deleteSubcollection(customerRef, 'deliveries');

        await customerRef.delete();

        return res.status(200).json({ message: 'Customer deleted successfully' });
    } catch (error) {
        console.error('Error deleting customer:', error);
        return res.status(500).json({ message: 'Failed to delete customer' });
    }
};

const updateCustomer = async (req, res) => {
    const { id, name, business, phone } = req.body;
    if (!id || !name || !business || !phone) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const db = getFirestore();
        const customerRef = db.collection('customers').doc(id);

        const customerDoc = await customerRef.get();

        if (!customerDoc.exists) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        await customerRef.update({ name, business, phone });

        return res.status(200).json({ message: 'Customer updated successfully' });
    } catch (error) {
        console.error('Error updating customer:', error);
        return res.status(500).json({ message: 'Failed to update customer' });
    }
};

const addDeliveryPartner = async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        console.log("Add delivery: ", name, phone, password);
        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Name, phone number, and password are required.' });
        }

        const db = getFirestore();

        const existingDoc = await db.collection('DeliveryMan').doc(phone).get();
        if (existingDoc.exists) {
            return res.status(400).json({ message: 'A delivery partner with this phone number already exists.' });
        }

        await db.collection('DeliveryMan').doc(phone).set({ name, phone, password });

        res.status(201).json({ message: 'Delivery partner added successfully.' });
    } catch (err) {
        console.error('Error adding delivery partner:', err);
        res.status(500).json({ message: 'Server error while adding delivery partner.' });
    }
};

const addSalesPerson = async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        console.log("Add sales: ", name, phone, password);
        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Name, phone number, and password are required.' });
        }

        const db = getFirestore();

        const existingDoc = await db.collection('Salesman').doc(phone).get();
        if (existingDoc.exists) {
            return res.status(400).json({ message: 'A salesperson with this phone number already exists.' });
        }

        await db.collection('Salesman').doc(phone).set({ name, phone, password });

        res.status(201).json({ message: 'Salesperson added successfully.' });
    } catch (err) {
        console.error('Error adding salesperson:', err);
        res.status(500).json({ message: 'Server error while adding salesperson.' });
    }
};

const getDeliveryPartners = async (req, res) => {
    try {
        const db = getFirestore();
        const snapshot = await db.collection('DeliveryMan').get();

        const deliveryPartners = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json(deliveryPartners);
    } catch (err) {
        console.error('Error fetching delivery partners:', err);
        res.status(500).json({ message: 'Failed to fetch delivery partners.' });
    }
};

const getSalesPartners = async (req, res) => {
    try {
        const db = getFirestore();
        const snapshot = await db.collection('Salesman').get();

        const salesPartners = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json(salesPartners);
    } catch (err) {
        console.error('Error fetching sales partners:', err);
        res.status(500).json({ message: 'Failed to fetch sales partners.' });
    }
};

const updateDeliveryPartner = async (req, res) => {
  try {
    const { id, name, phone } = req.body;

    const db = getFirestore();
    await db.collection('DeliveryMan').doc(id).update({ name, phone });

    res.status(200).json({ message: 'Delivery partner updated successfully.' });
  } catch (err) {
    console.error('Error updating delivery partner:', err);
    res.status(500).json({ message: 'Server error while updating delivery partner.' });
  }
};

const deleteDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.body;

    const db = getFirestore();
    await db.collection('DeliveryMan').doc(id).delete();

    res.status(200).json({ message: 'Delivery partner deleted successfully.' });
  } catch (err) {
    console.error('Error deleting delivery partner:', err);
    res.status(500).json({ message: 'Server error while deleting delivery partner.' });
  }
};

const updateSalesPartner = async (req, res) => {
  try {
    const { id, name, phone } = req.body;

    const db = getFirestore();
    await db.collection('Salesman').doc(id).update({ name, phone });

    res.status(200).json({ message: 'Sales partner updated successfully.' });
  } catch (err) {
    console.error('Error updating sales partner:', err);
    res.status(500).json({ message: 'Server error while updating sales partner.' });
  }
};

const deleteSalesPartner = async (req, res) => {
  try {
    const { id } = req.body;

    const db = getFirestore();
    await db.collection('Salesman').doc(id).delete();

    res.status(200).json({ message: 'Sales partner deleted successfully.' });
  } catch (err) {
    console.error('Error deleting sales partner:', err);
    res.status(500).json({ message: 'Server error while deleting sales partner.' });
  }
};



export {
    login,
    userInfo,
    deleteCustomer,
    updateCustomer,
    addDeliveryPartner,
    addSalesPerson,
    getDeliveryPartners,
    getSalesPartners,
    updateDeliveryPartner,
    updateSalesPartner,
    deleteDeliveryPartner, 
    deleteSalesPartner
};
