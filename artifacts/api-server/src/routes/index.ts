import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";
import authRouter from "./auth";
import privacyRouter from "./privacy";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/privacy", privacyRouter);
router.use("/openai", openaiRouter);

export default router;
