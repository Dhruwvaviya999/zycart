import { Router } from 'express';
import { adminRouter } from './admin.routes';
import { aiRouter } from './ai.routes';
import { authRouter } from './auth.routes';
import { brandRouter } from './brand.routes';
import { cartRouter } from './cart.routes';
import { categoryRouter } from './category.routes';
import { checkoutRouter } from './checkout.routes';
import { healthRouter } from './health.routes';
import { orderRouter } from './order.routes';
import { paymentRouter } from './payment.routes';
import { productRouter } from './product.routes';
import { reviewRouter } from './review.routes';
import { userRouter } from './user.routes';
import { wishlistRouter } from './wishlist.routes';

export const apiRouter = Router();

apiRouter.use(healthRouter);

// Declared early so the whole `/api/admin` namespace passes its own guard
// before any storefront router gets a chance to match a path.
apiRouter.use(adminRouter);
apiRouter.use(authRouter);
apiRouter.use(aiRouter);
apiRouter.use(userRouter);
apiRouter.use(cartRouter);
apiRouter.use(wishlistRouter);
apiRouter.use(checkoutRouter);
apiRouter.use(orderRouter);
apiRouter.use(paymentRouter);
// Declared before the product router so `/products/:id/reviews` is matched
// here rather than falling through to the catalogue's own parameter routes.
apiRouter.use(reviewRouter);
apiRouter.use(productRouter);
apiRouter.use(categoryRouter);
apiRouter.use(brandRouter);
