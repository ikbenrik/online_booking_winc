import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const loadData = async () => {
  await prisma.review.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.amenity.deleteMany({});
  await prisma.property.deleteMany({});
  await prisma.host.deleteMany({});
  await prisma.user.deleteMany({});

  // Load data from JSON files
  const usersData = JSON.parse(fs.readFileSync('./src/data/users.json', 'utf8'));
  const hostsData = JSON.parse(fs.readFileSync('./src/data/hosts.json', 'utf8'));
  const propertiesData = JSON.parse(fs.readFileSync('./src/data/properties.json', 'utf8'));
  const amenitiesData = JSON.parse(fs.readFileSync('./src/data/amenities.json', 'utf8'));
  const bookingsData = JSON.parse(fs.readFileSync('./src/data/bookings.json', 'utf8'));
  const reviewsData = JSON.parse(fs.readFileSync('./src/data/reviews.json', 'utf8'));


  // Insert Users
  for (const user of usersData) {
    await prisma.user.create({
      data: user,
    });
  }

  // Insert Hosts
  for (const host of hostsData) {
    await prisma.host.create({
      data: host,
    });
  }

  // Insert Properties (after hosts)
  for (const property of propertiesData) {
    await prisma.property.create({
      data: property,
    });
  }

    // Insert Amenties (after Properties)
    for (const amenity of amenitiesData) {
      await prisma.amenity.create({
        data: amenity,
      });
    }

      // Insert bookings (after amenities)
  for (const booking of bookingsData) {
    await prisma.booking.create({
      data: booking,
    });
  }

    // Insert reviews (after bookings)
    for (const review of reviewsData) {
      await prisma.review.create({
        data: review,
      });
    }

  console.log('Data successfully seeded');
};

loadData()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
