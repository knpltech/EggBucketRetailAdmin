import express from "express";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// import different function from AdminController.js
import { 
    login, 
    userInfo,
    specificUser,
    deleteCustomer,
    updateCustomer,
    addDeliveryPartner,
    addSalesPerson,
    getSalesPartners,
    getDeliveryPartners,
    updateDeliveryPartner,
    updateSalesPartner, 
    deleteDeliveryPartner,
    deleteSalesPartner,
    getUserDeliveries,
    getAllCustomerDeliveries,
    toggleDeliveryPerson,
    toggleSalesPerson,
    addCustomer
} from "../Controller/AdminController.js";

// Customer routes
router.route("/login").post(login);
router.route("/user-info").get(userInfo);
router.get("/customer-info/:id", specificUser);
router.delete("/customer/delete", deleteCustomer);
router.put("/customer/update", updateCustomer);
router.get("/customer/deliveries/:id", getUserDeliveries);
router.get("/all-deliveries", getAllCustomerDeliveries);
router.post("/add-customer", upload.single('image'), addCustomer);

// Delivery partner related routes
router.post("/add-del-partner", addDeliveryPartner);
router.get('/get-del-partner', getDeliveryPartners);
router.put('/delivery/update', updateDeliveryPartner);
router.delete('/delivery/delete', deleteDeliveryPartner);
router.put('/delivery/toggle/:id', toggleDeliveryPerson);

// Sales person related routes
router.post("/add-sales-partner", addSalesPerson);
router.get('/get-sales-partner', getSalesPartners);
router.put('/sales/update', updateSalesPartner);
router.delete('/sales/delete', deleteSalesPartner);
router.put('/sales/toggle/:id', toggleSalesPerson);

export default router;
