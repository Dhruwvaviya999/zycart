# Synthetic product data

`pnpm seed:products` generates a realistic catalogue for development and load testing, then bulk-inserts it into MongoDB. The generator lives in `backend/scripts/seed-products/`, outside `src/`, so it is never built into `dist`.

## Quick reference

Run these from the repo root. `pnpm seed:products …` and `npm run seed:products -- …` do the same thing.

```bash
# 500 products, replacing any generated ones already there
npm run seed:products -- --count 500 --clear

# 1,000 products you can reproduce exactly
npm run seed:products -- --count 1000 --seed demo --clear

# 5,000 products for load testing, in bigger batches
npm run seed:products -- --count 5000 --seed load-test --clear --batch-size 1000

# Try it without touching the database, and look at the output
npm run seed:products -- --count 50 --dry-run --out sample.json

# Remove the generated products only
npm run seed:products -- --count 0 --clear
```

| Option | Meaning |
| --- | --- |
| `--count <n>` | How many products to generate. Default 500, maximum 50,000. |
| `--seed <value>` | Makes the run reproducible. Without it, a random seed is chosen and printed. |
| `--date <YYYY-MM-DD>` | The dataset's "today" (defaults to today, UTC). Product ages and new-arrival flags count back from it. |
| `--clear` | Delete earlier generated products (SKU prefix `ZG-`) first. |
| `--replace-all --yes` | Delete **every** product first, including hand-written ones. |
| `--append` | Add to the generated products already there instead of refusing. |
| `--no-ratings` | Leave products unrated. |
| `--batch-size <n>` | Documents per `insertMany` call (default 500). |
| `--dry-run` | Generate and validate without connecting to MongoDB. |
| `--out <file>` | Also write the dataset to JSON. |

The same `--seed`, `--count` and `--date` always give the same dataset. Every run ends by printing the exact command to reproduce it.

## What it generates

- **8 categories, 48 subcategories.** The categories are electronics, fashion, footwear, accessories, home, appliances (new), beauty and sports (new). A category that is missing gets created. An existing one is reused and never changed, so its GST rate and try-on setting stay as an admin set them.
- **Subcategories** (smartphones, running shoes, sarees and so on) are not documents, because the Category model has no parent field. Each product carries its subcategory as a search tag and in its SKU, for example `ZG-ELE-PHN-SAM4821`. Searching the storefront for "smartphones" finds them.
- **Specifications depend on the category.** Phones list RAM, storage, chip, display, camera, battery and connectivity. Clothing lists fabric, fit, neck, sleeve and gender. Shoes list upper, sole and drop. Appliances list capacity, energy rating, power and warranty.
- **Prices are in INR**, rounded the way shops print them (₹349, ₹1,299, ₹24,999). The MRP goes in `compareAtPrice`. How deep the discount goes depends on the category and the brand tier.
- **The numbers are related.** Each product has one hidden popularity value. Cheaper, mass-market and well-discounted products get more reviews and more stock. Premium products get fewer reviews but higher ratings. New listings have few reviews. Ratings have the J shape real stores show.
- **Rating aggregates are internally exact.** `ratingSum`, `ratingBreakdown`, `reviewCount` and `rating` agree with each other the same way the review service keeps them.
- **Apparel and footwear track stock per variant** (colour × size). The variant counts add up to `stock`, and size availability is derived from them. Each product's opening stock is written to the inventory ledger as an `INITIAL_STOCK` row.
- **Images are real Unsplash photos.** Each photo was checked to load and to show the right kind of product. Unsplash is the only external image host `next.config.ts` allows. Each product gets 2–4 images, including a close-up crop. The pools are small, so photos repeat across a large catalogue.

## Safety

- Nothing is deleted until the new dataset has passed validation. Validation runs the admin API's `createProductSchema`, the Mongoose schema, and checks for stock totals, rating consistency, price below MRP, and unique names, slugs and SKUs.
- If an insert fails partway through, the run deletes the products it had already inserted.
- If generated products already exist and you pass neither `--clear` nor `--append`, the run refuses.
- `--replace-all` needs `--yes`, and with `NODE_ENV=production` the script refuses unless you pass `--allow-production`.
- A clear also removes reviews, alerts, user-activity rows, cart and wishlist entries, and ledger rows that point at the deleted products. Orders and returns are kept, because their lines are snapshots.

## Caveats

- Ratings are synthetic. Since Phase 8, a product's rating normally comes only from approved reviews. Generated products show review counts without any review documents behind them. Use `--no-ratings` if you want a catalogue that has to earn its stars. Running `pnpm seed:reviews` afterwards recomputes the aggregates from real reviews, which resets the synthetic numbers.
- Brand names are real (Samsung, boAt, Titan and so on), but the models, specs and prices are made up for test data.
- `pnpm seed` still restores the old hand-written catalogue, and it deletes all products, generated ones included.
