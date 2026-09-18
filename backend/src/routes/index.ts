import { Router } from 'express';
import { authRouter } from './auth.routes';
import { brandRouter } from './brand.routes';
import { cartRouter } from './cart.routes';
import { categoryRouter } from './category.routes';
import { healthRouter } from './health.routes';
import { productRouter } from './product.routes';
import { userRouter } from './user.routes';
import { wishlistRouter } from './wishlist.routes';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(userRouter);
apiRouter.use(cartRouter);
apiRouter.use(wishlistRouter);
apiRouter.use(productRouter);
apiRouter.use(categoryRouter);
apiRouter.use(brandRouter);
