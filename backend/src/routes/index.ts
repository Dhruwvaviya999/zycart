import { Router } from 'express';
import { brandRouter } from './brand.routes';
import { categoryRouter } from './category.routes';
import { healthRouter } from './health.routes';
import { productRouter } from './product.routes';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(productRouter);
apiRouter.use(categoryRouter);
apiRouter.use(brandRouter);
