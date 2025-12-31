import { db, products } from './index.js';

async function seed() {
  console.log('Seeding database...');

  await db.insert(products).values({
    url: 'https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html',
    name: 'A Light in the Attic',
    active: true,
    schedule: '0 9 * * *',
  });

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch(console.error);
