import express from "express";

const router = express.Router();

import { 
    login, 
    userInfo,
    addDeliveryPartner,
    addSalesPerson
} from "../Controller/AdminController.js";

router.route("/login").post(login);
router.route("/user-info").get(userInfo);
router.route("/add-del-partner").post(addDeliveryPartner);
router.post("/add-sales-person", addSalesPerson);

export default router;
