import { Router } from "express";
import { generateScript } from "../controllers/script.controller.js";

const router = Router();

router.post("/generate", generateScript);

export default router;
