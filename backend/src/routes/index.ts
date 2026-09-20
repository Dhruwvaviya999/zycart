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
import { recommendationRouter } from './recommendation.routes';
import { returnRouter } from './return.routes';
import { reviewRouter } from './review.routes';
import { searchRouter } from './search.routes';
import { userRouter } from './user.routes';
import { wishlistRouter } from './wishlist.routes';

export const apiRouter = Router();

apiRouter.use(healthRouter);

// Declared early so the whole `/api/admin` namespace passes its own guard
// before any storefront router gets a chance to match a path.
apiRouter.use(adminRouter);
apiRouter.use(authRouter);
apiRouter.use(aiRouter);
apiRouter.use(searchRouter);
apiRouter.use(recommendationRouter);
apiRouter.use(userRouter);
apiRouter.use(cartRouter);
apiRouter.use(wishlistRouter);
apiRouter.use(checkoutRouter);
apiRouter.use(orderRouter);
// Declared after the order router so `/orders/:orderRef/returns` is reached
// only once `/orders/:orderRef` has had its chance — and before the product
// router, which owns no `/returns` path but sits at the end of the chain.
apiRouter.use(returnRouter);
apiRouter.use(paymentRouter);
// Declared before the product router so `/products/:id/reviews` is matched
// here rather than falling through to the catalogue's own parameter routes.
apiRouter.use(reviewRouter);
apiRouter.use(productRouter);
apiRouter.use(categoryRouter);
apiRouter.use(brandRouter);
