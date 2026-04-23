import express from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// import login from AuthController
import { login } from "../Controller/AuthController.js";

// import customer info functions from CustomerInfoController
import {
  userInfo,
  specificUser,
  getUserDeliveries,
  getAllCustomerDeliveries,
  addCustomer,
} from "../Controller/CustomerInfoController.js";

// import customer functions from CustomerController
import {
  deleteCustomer,
  updateCustomer,
} from "../Controller/CustomerController.js";

// import delivery partner functions from DeliveryPartnerController
import {
  addDeliveryPartner,
  getDeliveryPartners,
  updateDeliveryPartner,
  deleteDeliveryPartner,
  toggleDeliveryPerson,
} from "../Controller/DeliveryPartnerController.js";

// import sales partner functions from SalesPartnerController
import {
  addSalesPerson,
  getSalesPartners,
  updateSalesPartner,
  deleteSalesPartner,
  toggleSalesPerson,
} from "../Controller/SalesPartnerController.js";

// import different functions from AdminController.js
import {
  getCustomerMapStatus,
  updateCustomerMeta,
  updateCustomerPriority,
  updateCustomerPotential,
  addZone,
  getZones,
  getAnalyticsLast8,
  getCustomersByDeliveryDays,
  getRetentionCustomers,
  resetRetentionCustomer,
  saveCheckedReason,
  resetAllCheckedReasons,
  saveDeliveredTrays,
  getAllCustomerDeliveriesRange,
  getCustomersByDeliveryCount,
  getLatestRemarks,
  toggleTodayDelivery,
  saveSkipConfig,
} from "../Controller/AdminController.js";

// Customer routes 
router.route("/login").post(login);
router.use(authenticateToken);

router.route("/user-info").get(userInfo);
router.get("/customer-info/:id", specificUser);
router.delete("/customer/delete", deleteCustomer);
router.put("/customer/update", updateCustomer);
router.get("/customer/deliveries/:id", getUserDeliveries);
router.get("/all-deliveries", getAllCustomerDeliveries);
router.post("/add-customer", upload.single("image"), addCustomer);
router.post("/customer/status", updateCustomerMeta);
router.post("/customer/priority", updateCustomerPriority);
router.post("/customer/potential", updateCustomerPotential);
router.post("/customer/delivery-reason", saveCheckedReason);
router.post("/customer/delivery-reason/reset-all", resetAllCheckedReasons);
router.post("/customer/delivery-trays", saveDeliveredTrays);
router.post("/customer/toggle-delivery", toggleTodayDelivery);
router.post("/customer/skip-config", saveSkipConfig);
router.post("/zones/add", addZone);
router.get("/zones", getZones);

router.get("/analytics/last8", getAnalyticsLast8);
router.get("/all-deliveries-range", getAllCustomerDeliveriesRange);
router.get("/customer/delivery-days", getCustomersByDeliveryDays);
router.get("/customer/by-delivery-count", getCustomersByDeliveryCount);
router.get("/customer/latest-remarks", getLatestRemarks);
router.get("/customer-retention", getRetentionCustomers);
router.post("/customer-retention/reset", resetRetentionCustomer);

// Delivery partner related routes
router.post("/add-del-partner", addDeliveryPartner);
router.get("/get-del-partner", getDeliveryPartners);
router.put("/delivery/update", updateDeliveryPartner);
router.delete("/delivery/delete", deleteDeliveryPartner);
router.put("/delivery/toggle/:id", toggleDeliveryPerson);
router.get("/customer-map-status", getCustomerMapStatus);

// Sales person related routes
router.post("/add-sales-partner", addSalesPerson);
router.get("/get-sales-partner", getSalesPartners);
router.put("/sales/update", updateSalesPartner);
router.delete("/sales/delete", deleteSalesPartner);
router.put("/sales/toggle/:id", toggleSalesPerson);

export default router;
