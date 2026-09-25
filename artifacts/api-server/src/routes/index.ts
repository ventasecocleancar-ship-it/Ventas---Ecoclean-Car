import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ecocleanRouter from "./ecoclean";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ecocleanRouter);

export default router;
