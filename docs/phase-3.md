# Phase 3 — Product Catalogue, Categories & Brands

## Goal

Replace the Phase 2 mock catalogue with a real MongoDB-backed one, served by the
Express API and consumed by the Next.js storefront. The Phase 2 UI is unchanged
apart from what the new data shape required.

```text
MongoDB → Mongoose → Express → Axios → Next.js → ZyCart storefront
```

## Data model

### Product (`backend/src/models/product.model.ts`)

| Field                                          | Type                           | Notes                                               |
| ---------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| `name`                                         | String, required               | Max 160 characters                                  |
| `slug`                                         | String, required, **unique**   | Derived from the name on create; immutable after    |
| `description`                                  | String, required               | Long form, 10–4000 characters                       |
| `shortDescription`                             | String                         | One line, used on cards and in search               |
| `images`                                       | [String], required             | Plain URLs, at least one                            |
| `price`                                        | Number, required, min 0        |                                                     |
| `compareAtPrice`                               | Number, min 0, nullable        | Must exceed `price` when set                        |
| `category`                                     | ObjectId → `Category`          | Required, indexed                                   |
| `brand`                                        | ObjectId → `Brand`             | Required, indexed                                   |
| `sku`                                          | String, required, **unique**   | Uppercased; immutable after create                  |
| `stock`                                        | Number, required, min 0        | `stock > 0` is what "in stock" means                |
| `colors`                                       | [{ name, hex }]                | `hex` drives the swatch                             |
| `sizes`                                        | [{ label, inStock }]           | Per-size availability                               |
| `tags`                                         | [String], indexed              | Extra search terms                                  |
| `highlights`                                   | [String]                       | Bullets on the product page                         |
| `specifications`                               | [{ label, value }]             | Spec table                                          |
| `rating` / `reviewCount`                       | Number                         | 0–5 / ≥ 0                                           |
| `isFeatured` / `isBestSeller` / `isNewArrival` | Boolean                        | Drive the three homepage rails                      |
| `isActive`                                     | Boolean, default true, indexed | Storefront queries only ever return active products |
| `createdAt` / `updatedAt`                      | Date                           | Mongoose timestamps                                 |

### Category (`category.model.ts`)

`name` (unique), `slug` (unique), `description`, `image`, `isActive`, timestamps.
The list endpoint adds a computed `productCount`.

### Brand (`brand.model.ts`)

`name` (unique), `slug` (unique), `logo`, `isActive`, timestamps.

### Indexes

`slug` and `sku` are unique. Single-field indexes on `category`, `brand`, `tags`
and `isActive`; a compound `{ isActive: 1, createdAt: -1 }` for the default
listing and `{ price: 1 }` for the price filter and the two price sorts.

### Serialisation

Every model shares `baseSchemaOptions`, so documents serialise with `id` rather
than `_id` and without a version key. Populated references inherit it, which is
why `product.brand` reads `{ id, name, slug }`.

## API

Base path `/api`. Success is `{ success: true, data }`, plus `pagination` on the
product list. Failure is `{ success: false, message }`, with `errors[]` on a
validation failure.

### Products

| Method   | Path                              | Purpose                                |
| -------- | --------------------------------- | -------------------------------------- |
| `GET`    | `/api/products`                   | Paginated list with search/filter/sort |
| `GET`    | `/api/products/featured`          | `isFeatured` rail                      |
| `GET`    | `/api/products/best-sellers`      | `isBestSeller` rail                    |
| `GET`    | `/api/products/new-arrivals`      | `isNewArrival` rail                    |
| `GET`    | `/api/products/:idOrSlug`         | One product                            |
| `GET`    | `/api/products/:idOrSlug/related` | Same category, excluding itself        |
| `POST`   | `/api/products`                   | Create                                 |
| `PATCH`  | `/api/products/:id`               | Update                                 |
| `DELETE` | `/api/products/:id`               | Delete                                 |

The literal rails are registered before `:idOrSlug`, so `featured` is never read
as a slug.

**A slug is the public handle and only ever resolves an active product; an id is
the admin handle and resolves regardless**, so a deactivated product can still be
inspected. Authentication arrives in a later phase — until then these write
endpoints are unauthenticated and are development-only.

#### `GET /api/products` query parameters

| Parameter               | Type                | Default  | Notes                                                                               |
| ----------------------- | ------------------- | -------- | ----------------------------------------------------------------------------------- |
| `page`                  | integer ≥ 1         | `1`      |                                                                                     |
| `limit`                 | integer 1–100       | `12`     |                                                                                     |
| `search`                | string ≤ 100        | —        | Name, short description, SKU, tags, brand name, category name                       |
| `category`              | slug or id          | —        | Unknown value yields an empty page                                                  |
| `brand`                 | slug or id          | —        |                                                                                     |
| `minPrice` / `maxPrice` | number ≥ 0          | —        | `minPrice` may not exceed `maxPrice`                                                |
| `minRating`             | number 0–5          | —        |                                                                                     |
| `inStock`               | `true` \| `false`   | —        | `true` is `stock > 0`, `false` is `stock = 0`                                       |
| `ids`                   | comma-separated ids | —        | How the cart and wishlist resolve what they stored; unparseable entries are ignored |
| `sort`                  | see below           | `newest` |                                                                                     |

`sort` accepts `newest`, `oldest`, `price_asc`, `price_desc`, `rating`. Every
sort carries `_id` as a tiebreaker so paging never repeats or skips a row.

### Categories and brands

| Method   | Path                    |
| -------- | ----------------------- |
| `GET`    | `/api/categories`       |
| `GET`    | `/api/categories/:slug` |
| `POST`   | `/api/categories`       |
| `PATCH`  | `/api/categories/:id`   |
| `DELETE` | `/api/categories/:id`   |

Brands mirror this at `/api/brands`. Both list endpoints return active records
only; pass `?includeInactive=true` for the full set. Deleting a category or brand
that products still reference returns `409` rather than orphaning the catalogue.

## Example requests

```bash
# Page two of footwear, cheapest first
curl "http://localhost:5000/api/products?category=footwear&sort=price_asc&page=2&limit=12"

# Search across names, SKUs, tags, brands and categories
curl "http://localhost:5000/api/products?search=running%20shoes"

# In stock, between two prices, rated 4.5 and above
curl "http://localhost:5000/api/products?inStock=true&minPrice=1000&maxPrice=10000&minRating=4.5"

# One product
curl "http://localhost:5000/api/products/nike-air-max-heritage-runner"

# Create one
curl -X POST http://localhost:5000/api/products \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Trail Runner GTX",
    "description": "A waterproof trail shoe built for long, wet days.",
    "images": ["https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb"],
    "price": 7499, "compareAtPrice": 9999,
    "category": "<category id>", "brand": "<brand id>",
    "sku": "ZY-FTW-099", "stock": 25
  }'
```

### Response shapes

```json
{
  "success": true,
  "data": [
    { "id": "...", "name": "...", "brand": { "id": "...", "name": "Nike", "slug": "nike" } }
  ],
  "pagination": { "page": 1, "limit": 12, "total": 36, "totalPages": 3 }
}
```

```json
{ "success": false, "message": "Product not found" }
```

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "path": "price", "message": "Too small: expected number to be >=0" }]
}
```

## Seeding

```bash
pnpm --filter zycart-backend seed   # or: cd backend && pnpm seed
```

`backend/src/utils/seed.ts` empties the products, categories and brands
collections and reloads them from `seed-data.ts`: 6 categories, 21 brands and 36
products spanning every category, with varied prices, discounts, ratings, stock
levels (including one sold out and several low), colours, sizes and rail flags.
It touches nothing else in the database. Products are inserted with
`timestamps: false` so their authored `createdAt` values survive, which is what
makes `newest` and `oldest` sorting meaningful.

## Frontend

`frontend/services/` holds the only code that talks to the API:

| Module                | Exports                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.ts`              | Axios instance, `ApiError`, `request()` / `requestList()` envelope unwrapping                                                                  |
| `product.service.ts`  | `getProducts`, `getProductBySlug`, `getFeaturedProducts`, `getBestSellingProducts`, `getNewArrivals`, `getRelatedProducts`, `getProductsByIds` |
| `category.service.ts` | `getCategories`, `getCategoryBySlug`, `getCategoriesSafe`                                                                                      |
| `brand.service.ts`    | `getBrands`, `getBrandBySlug`, `getBrandsSafe`                                                                                                 |

Components never call Axios directly.

### Where the data is fetched

| Page                 | How                                                                      |
| -------------------- | ------------------------------------------------------------------------ |
| `/`                  | Server component, `Promise.allSettled` over the three rails + categories |
| `/shop`              | Server component reads `searchParams`; the client pushes URL changes     |
| `/products/[slug]`   | Server component; the two rails stream in behind `<Suspense>`            |
| `/cart`, `/wishlist` | Client components resolve stored ids through `?ids=`                     |

**Filters live in the URL.** `/shop` is a server component, so a filtered view is
shareable and the back button works. The controls push a new URL inside
`useTransition`, which keeps the current results on screen — dimmed — rather than
blanking the grid on every keystroke; typing is debounced to one navigation.

**The `_Safe` variants never throw.** Categories and brands feed navigation chrome
and the filter panel, which must still render when the API is unreachable.

**Every catalogue page is `force-dynamic`.** The catalogue is read per request, so
nothing is prerendered — which also means `next build` never needs a running API.
Caching and revalidation are a later concern.

**Cart and wishlist store ids only.** Prices and stock always come from the API on
load, so a stale local value can never change what a shopper is shown.

## Known limitations

**`notFound()` returns HTTP 200.** A missing product renders the correct
not-found page, but the status line says `200`. This reproduces on a bare page
whose entire body is `notFound()`, with no error boundary present, so it is
Next.js 16.3.5 behaviour rather than anything in this code. The Phase 2 workaround
(`dynamicParams = false`) is not available now that slugs come from the database.

**Reviews are still static.** `frontend/data/reviews.ts` backs the reviews tab;
a reviews service is a later phase.

**Image hosts are allowlisted.** `next.config.ts` permits `images.unsplash.com`
only. Seeding products from another host means adding it to `remotePatterns`.

## Deliberately excluded

Authentication, authorisation, admin UI, cart/wishlist/order APIs, checkout,
payments, coupons, reviews, Cloudinary, email, AI features, vector search, Redis
and Docker. Phase 3 is the catalogue only.
