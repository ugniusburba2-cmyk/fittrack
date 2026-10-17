/* =========================================================
   Built-in starter food list (works offline).
   All values are PER 100 g (or 100 ml for drinks).
   Values are typical averages (mostly USDA). Packaged products
   differ, so scan the barcode for exact values.

   Format of each line:
   [name, kcal, protein, carbs, fat, fiber, sugar, units]
   units = list of [unit name, grams in one unit]
   ========================================================= */

const STARTER_FOODS_RAW = [
  // ---- Fruit ----
  ['Banana', 89, 1.1, 22.8, 0.3, 2.6, 12.2, [['piece', 118]]],
  ['Apple', 52, 0.3, 13.8, 0.2, 2.4, 10.4, [['piece', 182]]],
  ['Orange', 47, 0.9, 11.8, 0.1, 2.4, 9.4, [['piece', 131]]],
  ['Pear', 57, 0.4, 15.2, 0.1, 3.1, 9.8, [['piece', 178]]],
  ['Kiwi', 61, 1.1, 14.7, 0.5, 3.0, 9.0, [['piece', 69]]],
  ['Strawberries', 32, 0.7, 7.7, 0.3, 2.0, 4.9, [['cup', 152]]],
  ['Blueberries', 57, 0.7, 14.5, 0.3, 2.4, 10.0, [['cup', 148]]],
  ['Grapes', 69, 0.7, 18.1, 0.2, 0.9, 15.5, [['cup', 151]]],
  ['Mango', 60, 0.8, 15.0, 0.4, 1.6, 13.7, [['cup', 165]]],
  ['Pineapple', 50, 0.5, 13.1, 0.1, 1.4, 9.9, [['cup', 165]]],
  ['Watermelon', 30, 0.6, 7.6, 0.2, 0.4, 6.2, [['cup', 152]]],
  ['Avocado', 160, 2.0, 8.5, 14.7, 6.7, 0.7, [['piece', 150]]],
  ['Raisins', 299, 3.1, 79.2, 0.5, 3.7, 59.2, [['tbsp', 9]]],
  ['Dates, dried', 282, 2.5, 75.0, 0.4, 8.0, 63.4, [['piece', 8]]],

  // ---- Vegetables ----
  ['Broccoli', 34, 2.8, 6.6, 0.4, 2.6, 1.7, [['cup', 91]]],
  ['Carrot', 41, 0.9, 9.6, 0.2, 2.8, 4.7, [['piece', 61]]],
  ['Tomato', 18, 0.9, 3.9, 0.2, 1.2, 2.6, [['piece', 123]]],
  ['Cucumber', 15, 0.7, 3.6, 0.1, 0.5, 1.7, [['piece', 300]]],
  ['Spinach', 23, 2.9, 3.6, 0.4, 2.2, 0.4, [['cup', 30]]],
  ['Lettuce', 15, 1.4, 2.9, 0.2, 1.3, 0.8, [['cup', 47]]],
  ['Bell pepper', 31, 1.0, 6.0, 0.3, 2.1, 4.2, [['piece', 120]]],
  ['Onion', 40, 1.1, 9.3, 0.1, 1.7, 4.2, [['piece', 110]]],
  ['Potato, boiled', 87, 1.9, 20.1, 0.1, 1.8, 0.9, [['piece', 170]]],
  ['Potato, raw', 77, 2.0, 17.5, 0.1, 2.2, 0.8, [['piece', 170]]],
  ['Sweet potato, baked', 90, 2.0, 20.7, 0.2, 3.3, 6.5, [['piece', 150]]],
  ['Green peas', 81, 5.4, 14.5, 0.4, 5.7, 5.7, [['cup', 145]]],
  ['Sweet corn', 86, 3.3, 19.0, 1.4, 2.7, 6.3, [['cup', 145]]],
  ['Mushrooms', 22, 3.1, 3.3, 0.3, 1.0, 2.0, [['cup', 70]]],
  ['Zucchini', 17, 1.2, 3.1, 0.3, 1.0, 2.5, [['piece', 200]]],
  ['Cabbage', 25, 1.3, 5.8, 0.1, 2.5, 3.2, [['cup', 89]]],
  ['Cauliflower', 25, 1.9, 5.0, 0.3, 2.0, 1.9, [['cup', 107]]],
  ['Green beans', 31, 1.8, 7.0, 0.2, 2.7, 3.3, [['cup', 110]]],
  ['Beetroot, boiled', 44, 1.7, 10.0, 0.2, 2.0, 8.0, [['piece', 80]]],

  // ---- Grains, bread, cereals ----
  ['White rice, cooked', 130, 2.7, 28.2, 0.3, 0.4, 0.1, [['cup', 158]]],
  ['White rice, dry', 365, 7.1, 80.0, 0.7, 1.3, 0.1, [['cup', 185]]],
  ['Brown rice, cooked', 123, 2.7, 25.6, 1.0, 1.6, 0.2, [['cup', 195]]],
  ['Pasta, cooked', 158, 5.8, 30.9, 0.9, 1.8, 0.6, [['cup', 140]]],
  ['Pasta, dry', 371, 13.0, 74.7, 1.5, 3.2, 2.7, []],
  ['Oats, rolled (dry)', 379, 13.2, 67.7, 6.5, 10.1, 1.0, [['cup', 81], ['tbsp', 6]]],
  ['Buckwheat, cooked', 92, 3.4, 19.9, 0.6, 2.7, 0.9, [['cup', 168]]],
  ['Buckwheat, dry', 346, 11.7, 74.9, 2.7, 10.3, 0, []],
  ['Quinoa, cooked', 120, 4.4, 21.3, 1.9, 2.8, 0.9, [['cup', 185]]],
  ['Couscous, cooked', 112, 3.8, 23.2, 0.2, 1.4, 0.1, [['cup', 157]]],
  ['White bread', 265, 9.0, 49.0, 3.2, 2.7, 5.0, [['slice', 30]]],
  ['Whole wheat bread', 252, 12.4, 42.7, 3.5, 6.0, 4.4, [['slice', 32]]],
  ['Rye bread', 259, 8.5, 48.3, 3.3, 5.8, 3.9, [['slice', 32]]],
  ['Wheat tortilla', 306, 8.0, 50.0, 8.0, 3.5, 2.5, [['piece', 45]]],
  ['Bagel', 257, 10.0, 50.5, 1.6, 2.2, 5.0, [['piece', 105]]],
  ['Croissant', 406, 8.2, 45.8, 21.0, 2.6, 11.3, [['piece', 57]]],
  ['Cornflakes', 357, 7.5, 84.0, 0.4, 3.3, 10.0, [['cup', 28]]],
  ['Granola', 489, 13.7, 53.9, 24.3, 5.3, 19.8, [['cup', 122]]],
  ['Rice cakes', 387, 8.2, 81.5, 2.8, 4.2, 0.9, [['piece', 9]]],
  ['Pancakes', 227, 6.4, 28.3, 9.7, 0.9, 5.0, [['piece', 40]]],

  // ---- Meat, fish, eggs ----
  ['Chicken breast, cooked', 165, 31.0, 0, 3.6, 0, 0, []],
  ['Chicken breast, raw', 120, 22.5, 0, 2.6, 0, 0, []],
  ['Chicken thigh, cooked', 209, 26.0, 0, 10.9, 0, 0, [['piece', 100]]],
  ['Turkey breast, cooked', 135, 30.0, 0, 1.0, 0, 0, []],
  ['Beef mince 5% fat, raw', 137, 21.4, 0, 5.0, 0, 0, []],
  ['Beef mince 20% fat, raw', 254, 17.2, 0, 20.0, 0, 0, []],
  ['Beef steak, cooked', 250, 27.0, 0, 15.0, 0, 0, []],
  ['Pork loin, cooked', 242, 27.0, 0, 14.0, 0, 0, []],
  ['Ham, sliced', 145, 21.0, 1.5, 6.0, 0, 1.0, [['slice', 15]]],
  ['Bacon, cooked', 541, 37.0, 1.4, 42.0, 0, 0, [['slice', 8]]],
  ['Frankfurter sausage', 290, 11.0, 4.0, 26.0, 0, 1.0, [['piece', 45]]],
  ['Salmon, raw', 208, 20.4, 0, 13.4, 0, 0, []],
  ['Salmon, cooked', 206, 22.1, 0, 12.4, 0, 0, []],
  ['Tuna, canned in water', 116, 25.5, 0, 0.8, 0, 0, [['can', 112]]],
  ['Cod, cooked', 105, 22.8, 0, 0.9, 0, 0, []],
  ['Shrimp, cooked', 99, 24.0, 0.2, 0.3, 0, 0, []],
  ['Herring, pickled', 262, 14.2, 9.6, 18.0, 0, 8.7, []],
  ['Egg, whole', 143, 12.6, 0.7, 9.5, 0, 0.4, [['piece', 50]]],
  ['Egg white', 52, 10.9, 0.7, 0.2, 0, 0.7, [['piece', 33]]],
  ['Tofu, firm', 144, 17.3, 2.8, 8.7, 2.3, 0.6, []],

  // ---- Dairy ----
  ['Milk 3.2%', 61, 3.2, 4.8, 3.3, 0, 5.0, [['cup', 244]]],
  ['Milk 1.5%', 46, 3.4, 4.9, 1.5, 0, 4.9, [['cup', 244]]],
  ['Skim milk', 34, 3.4, 5.0, 0.1, 0, 5.0, [['cup', 244]]],
  ['Oat milk', 46, 1.0, 6.6, 1.5, 0.8, 4.0, [['cup', 240]]],
  ['Greek yogurt 0%', 59, 10.3, 3.6, 0.4, 0, 3.2, [['cup', 170]]],
  ['Natural yogurt', 61, 3.5, 4.7, 3.3, 0, 4.7, [['cup', 245]]],
  ['Kefir 2.5%', 52, 3.3, 4.0, 2.5, 0, 4.0, [['cup', 240]]],
  ['Cottage cheese 4%', 98, 11.1, 3.4, 4.3, 0, 2.7, [['cup', 210]]],
  ['Quark / curd cheese, low fat', 72, 12.6, 4.0, 0.3, 0, 4.0, []],
  ['Cheddar cheese', 403, 24.9, 1.3, 33.1, 0, 0.5, [['slice', 21]]],
  ['Edam / Gouda cheese', 357, 25.0, 1.4, 27.8, 0, 1.4, [['slice', 20]]],
  ['Mozzarella', 254, 24.3, 2.8, 15.9, 0, 1.0, [['piece', 125]]],
  ['Parmesan', 431, 38.0, 4.1, 29.0, 0, 0.9, [['tbsp', 5]]],
  ['Feta cheese', 264, 14.2, 4.1, 21.3, 0, 4.1, []],
  ['Cream cheese', 342, 6.0, 4.0, 34.0, 0, 3.2, [['tbsp', 15]]],
  ['Sour cream', 193, 2.4, 4.6, 19.0, 0, 3.4, [['tbsp', 12]]],
  ['Butter', 717, 0.9, 0.1, 81.1, 0, 0.1, [['tbsp', 14], ['tsp', 5]]],
  ['Whey protein powder', 390, 78.0, 8.0, 6.0, 0, 5.0, [['scoop', 30]]],

  // ---- Beans, nuts, seeds ----
  ['Chickpeas, cooked', 164, 8.9, 27.4, 2.6, 7.6, 4.8, [['cup', 164]]],
  ['Lentils, cooked', 116, 9.0, 20.1, 0.4, 7.9, 1.8, [['cup', 198]]],
  ['Kidney beans, cooked', 127, 8.7, 22.8, 0.5, 6.4, 0.3, [['cup', 177]]],
  ['Black beans, cooked', 132, 8.9, 23.7, 0.5, 8.7, 0.3, [['cup', 172]]],
  ['Hummus', 166, 7.9, 14.3, 9.6, 6.0, 0.3, [['tbsp', 15]]],
  ['Peanut butter', 588, 25.0, 20.0, 50.0, 6.0, 9.0, [['tbsp', 16]]],
  ['Almonds', 579, 21.2, 21.6, 49.9, 12.5, 4.4, [['piece', 1.2], ['handful', 28]]],
  ['Walnuts', 654, 15.2, 13.7, 65.2, 6.7, 2.6, [['handful', 28]]],
  ['Peanuts', 567, 25.8, 16.1, 49.2, 8.5, 4.7, [['handful', 28]]],
  ['Cashews', 553, 18.2, 30.2, 43.9, 3.3, 5.9, [['handful', 28]]],
  ['Sunflower seeds', 584, 20.8, 20.0, 51.5, 8.6, 2.6, [['tbsp', 9]]],
  ['Chia seeds', 486, 16.5, 42.1, 30.7, 34.4, 0, [['tbsp', 12]]],

  // ---- Oils, sauces, sweet things ----
  ['Olive oil', 884, 0, 0, 100, 0, 0, [['tbsp', 13.5], ['tsp', 4.5]]],
  ['Sunflower oil', 884, 0, 0, 100, 0, 0, [['tbsp', 13.5], ['tsp', 4.5]]],
  ['Mayonnaise', 680, 1.0, 0.6, 75.0, 0, 0.6, [['tbsp', 14]]],
  ['Ketchup', 101, 1.0, 27.4, 0.1, 0.3, 22.8, [['tbsp', 17]]],
  ['Honey', 304, 0.3, 82.4, 0, 0.2, 82.1, [['tbsp', 21], ['tsp', 7]]],
  ['Sugar', 387, 0, 100, 0, 0, 100, [['tsp', 4]]],
  ['Jam', 278, 0.4, 68.9, 0.1, 1.1, 48.5, [['tbsp', 20]]],
  ['Chocolate hazelnut spread', 539, 6.3, 57.5, 30.9, 3.4, 56.3, [['tbsp', 19]]],
  ['Dark chocolate 70%', 598, 7.8, 45.9, 42.6, 10.9, 24.0, [['square', 10]]],
  ['Milk chocolate', 535, 7.7, 59.4, 29.7, 3.4, 51.5, [['square', 6]]],

  // ---- Snacks, fast food, drinks ----
  ['Potato chips', 536, 7.0, 53.0, 34.6, 4.4, 0.3, [['handful', 28]]],
  ['Popcorn, air-popped', 387, 12.9, 77.8, 4.5, 14.5, 0.9, [['cup', 8]]],
  ['Pizza, cheese', 266, 11.4, 33.0, 9.7, 2.3, 3.6, [['slice', 107]]],
  ['French fries', 312, 3.4, 41.4, 14.7, 3.8, 0.3, []],
  ['Orange juice', 45, 0.7, 10.4, 0.2, 0.2, 8.4, [['glass', 250]]],
  ['Cola', 42, 0, 10.6, 0, 0, 10.6, [['can', 330]]],
  ['Beer', 43, 0.5, 3.6, 0, 0, 0, [['bottle', 500]]],
  ['Red wine', 85, 0.1, 2.6, 0, 0, 0.6, [['glass', 150]]],
  ['Coffee, black', 2, 0.3, 0, 0, 0, 0, [['cup', 240]]]
];

// Turn the compact list above into food objects the app understands.
const STARTER_FOODS = STARTER_FOODS_RAW.map(function (row) {
  const name = row[0];
  return {
    id: 'b_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: name,
    brand: '',
    source: 'builtin',
    per100: { kcal: row[1], protein: row[2], carbs: row[3], fat: row[4], fiber: row[5], sugar: row[6] },
    units: row[7].map(function (u) { return { name: u[0], grams: u[1] }; })
  };
});
