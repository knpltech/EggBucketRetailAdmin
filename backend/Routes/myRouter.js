import express from "express";

const router = express.Router();

import { login, userInfo } from "../Controller/myController.js";

router.route("/login").post(login);
router.route("/user-info").get(userInfo);

export default router;
