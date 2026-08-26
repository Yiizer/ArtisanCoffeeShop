# 🚀 Quick Setup Guide - Run SQL in Supabase

Your app is deployed but the database is empty. Follow these steps:

---

## ✅ STEP 1: Open Supabase SQL Editor

1. Go to: https://supabase.com/dashboard
2. Select your `artisan-coffee-shop` project
3. Click "SQL Editor" in the left sidebar
4. Click "+ New query"

---

## ✅ STEP 2: Run the Schema Setup

Copy the entire content of `SUPABASE_SETUP.sql` file and paste it into the SQL editor.

Click "Run" (or press Ctrl+Enter)

You should see: ✅ **Success. No rows returned**

This creates all your database tables.

---

## ✅ STEP 3: Add Sample Menu Data

Since the seed script is complex, let's add a few items manually using SQL:

```sql
-- Add a few sample menu items
INSERT INTO "MenuItem" (id, name, description, "basePriceCents", category, available)
VALUES 
  ('espresso-1', 'Espresso', 'A concentrated single shot', 9000, 'Espresso', true),
  ('cappuccino-1', 'Cappuccino', 'Espresso with steamed milk', 13000, 'Espresso', true),
  ('latte-1', 'Caramel Latte', 'Sweet caramel latte', 15000, 'Espresso', true),
  ('drip-1', 'House Drip Coffee', 'Freshly brewed', 10000, 'Brewed Coffee', true),
  ('coldbrew-1', 'Cold Brew', 'Slow-steeped for 18 hours', 14000, 'Brewed Coffee', true),
  ('croissant-1', 'Butter Croissant', 'Flaky, all-butter', 8500, 'Pastries', true),
  ('muffin-1', 'Blueberry Muffin', 'Loaded with blueberries', 9500, 'Pastries', true);

-- Add sizes for drinks
INSERT INTO "MenuItemSize" (id, "menuItemId", name, "priceDeltaCents")
VALUES
  ('size-1', 'cappuccino-1', 'Small', -1500),
  ('size-2', 'cappuccino-1', 'Medium', 0),
  ('size-3', 'cappuccino-1', 'Large', 2000),
  ('size-4', 'latte-1', 'Small', -1500),
  ('size-5', 'latte-1', 'Medium', 0),
  ('size-6', 'latte-1', 'Large', 2000),
  ('size-7', 'drip-1', 'Small', -1000),
  ('size-8', 'drip-1', 'Medium', 0),
  ('size-9', 'drip-1', 'Large', 1500),
  ('size-10', 'coldbrew-1', 'Small', -1500),
  ('size-11', 'coldbrew-1', 'Medium', 0),
  ('size-12', 'coldbrew-1', 'Large', 2000);

-- Add common add-ons
INSERT INTO "MenuItemAddOn" (id, "menuItemId", name, "priceCents", available)
VALUES
  ('addon-1', 'cappuccino-1', 'Extra Shot', 3000, true),
  ('addon-2', 'cappuccino-1', 'Oat Milk', 2500, true),
  ('addon-3', 'cappuccino-1', 'Vanilla Syrup', 2000, true),
  ('addon-4', 'latte-1', 'Extra Shot', 3000, true),
  ('addon-5', 'latte-1', 'Oat Milk', 2500, true),
  ('addon-6', 'latte-1', 'Whipped Cream', 1500, true),
  ('addon-7', 'drip-1', 'Vanilla Syrup', 2000, true),
  ('addon-8', 'coldbrew-1', 'Vanilla Syrup', 2000, true),
  ('addon-9', 'coldbrew-1', 'Oat Milk', 2500, true);
```

Click "Run"

You should see: ✅ **Success. X rows affected**

---

## ✅ STEP 4: Test Your App!

1. Go to your Vercel URL: **https://artisan-coffee-shop-bsyb.vercel.app**
2. You should now see menu items!
3. Try creating a test order
4. Switch to Admin → check Menu Management
5. View Order History

---

## 🎉 YOU'RE DONE!

Your Artisan Coffee Shop is now **FULLY DEPLOYED** and ready to use!

---

## 📝 What's Next?

1. **Add More Menu Items:**
   - Go to Admin → Menu Management
   - Click "+ Add Menu Item"
   - Add your actual coffee shop items

2. **Train Your Team:**
   - Show them the Order Entry page
   - Demonstrate the Live Queue
   - Walk through order status changes

3. **Customize:**
   - Update menu items
   - Adjust prices
   - Add/remove categories

---

## 🆘 Troubleshooting

**"No menu items showing"**
- Make sure you ran Step 3 (inserting sample data)
- Check Supabase SQL Editor for errors

**"Database connection error"**
- Verify DATABASE_URL in Vercel environment variables
- Check Supabase project is running

**"Can't create orders"**
- Make sure all SQL scripts completed successfully
- Check browser console for errors

---

**Need Help?** Check the README.md or DEPLOYMENT_GUIDE.md for more details!
