import express from "express";
import { getPublicKey } from "../controllers/user.controllers.js";

const router = express.Router();

router.get("/public-key/:userId", getPublicKey);

export default router;