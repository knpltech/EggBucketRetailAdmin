import express from "express";

const router = express.Router();

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
    deleteSalesPartner
} from "../Controller/AdminController.js";

router.route("/login").post(login);
router.route("/user-info").get(userInfo);
router.get("/customer-info/:id", specificUser);
router.delete("/customer/delete", deleteCustomer);
router.put("/customer/update", updateCustomer);

router.post("/add-del-partner", addDeliveryPartner);
router.get('/get-del-partner', getDeliveryPartners);
router.put('/delivery/update', updateDeliveryPartner);
router.delete('/delivery/delete', deleteDeliveryPartner);

router.post("/add-sales-partner", addSalesPerson);
router.get('/get-sales-partner', getSalesPartners);
router.put('/sales/update', updateSalesPartner);
router.delete('/sales/delete', deleteSalesPartner)
export default router;
