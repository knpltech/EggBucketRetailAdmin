import express from "express";

const router = express.Router();

import { 
    login, 
    userInfo,
    addDeliveryPartner,
    addSalesPerson,
    getSalesPartners,
    getDeliveryPartners
} from "../Controller/AdminController.js";

router.route("/login").post(login);
router.route("/user-info").get(userInfo);
router.route("/add-del-partner").post(addDeliveryPartner);
router.post("/add-sales-person", addSalesPerson);
router.get('/get-sales-partner', getSalesPartners);
router.get('/get-del-partner', getDeliveryPartners);

export default router;
