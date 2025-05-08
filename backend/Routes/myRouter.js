import express from "express";
const router = express.Router();

router.route("/some").get(async (req, res) => {
    res.send("This is from server");
});

export default router;
