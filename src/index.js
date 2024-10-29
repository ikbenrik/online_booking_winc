import express from 'express';
import morgan from 'morgan'; // Morgan for logging requests with duration
import fs from 'fs';
import jwt from 'jsonwebtoken'; // JWT library for generating tokens
import path from 'path';
import { fileURLToPath } from 'url'; // Needed to resolve __dirname
import { v4 as uuidv4 } from 'uuid'; // To generate unique IDs for new users
import * as Sentry from '@sentry/node'; // For Sentry error tracking
import errorHandler from './middleware/errorHandling.js'; // Import custom error handler

const app = express();
const PORT = process.env.PORT || 3000;

// Secret key for signing JWT tokens
const JWT_SECRET = 'your_jwt_secret_key';

// Initialize Sentry with your DSN
Sentry.init({ dsn: 'https://46b829b2a73100de8d40563c551f115f@o4508048191193088.ingest.de.sentry.io/4508172352946256' });

// Middleware to parse JSON request bodies
app.use(express.json());

// Resolve __dirname and __filename in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom Morgan token for duration
morgan.token('duration', (req, res) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const time = (diff[0] * 1e9 + diff[1]) * 1e-6; // Convert to milliseconds
    console.log(`Request duration: ${time.toFixed(3)}ms`);
  });
  return '';
});

// Set up Morgan for logging request with duration
app.use(morgan(':method :url :status - :response-time ms - :duration'));

// Function to read data from a JSON file
const getData = (filename) => {
  try {
    const filePath = path.join(__dirname, 'data', `${filename}.json`);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data)[filename]; // Expecting data as {filename: [...]}
  } catch (err) {
    console.error(`Error reading ${filename}.json:`, err.message);
    return [];
  }
};

// Function to save data back to a JSON file
const saveData = (filename, data) => {
  try {
    const filePath = path.join(__dirname, 'data', `${filename}.json`);
    const jsonData = JSON.stringify({ [filename]: data }, null, 2);
    fs.writeFileSync(filePath, jsonData, 'utf8');
  } catch (err) {
    console.error(`Error saving to ${filename}.json:`, err.message);
  }
};

// Get all users from users.json
const getUsers = () => getData('users');

// Save all users to users.json
const saveUsers = (users) => saveData('users', users);

// Root route to check if server is working
app.get('/', (req, res) => {
  res.send('Server is working');
});

// POST /login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username);

  if (user && user.password === password) {
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: `Successfully logged in as ${username}`, token });
  } else {
    res.status(401).json({ message: `Login attempt for ${username} failed` });
  }
});

// GET /users route - fetch all users (except password)
app.get('/users', (req, res) => {
  let users = getUsers();
  const usersWithoutPassword = users.map(({ password, ...user }) => user);

  // Apply filtering based on query parameters (username, email)
  if (req.query.username) {
    const usernameQuery = req.query.username.toLowerCase();
    users = usersWithoutPassword.filter(user => user.username.toLowerCase() === usernameQuery);
  }

  if (req.query.email) {
    const emailQuery = req.query.email.toLowerCase();
    users = usersWithoutPassword.filter(user => user.email.toLowerCase() === emailQuery);
  }

  res.json(usersWithoutPassword);
});

// GET /users/:id route - fetch user by ID
app.get('/users/:id', (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.id === req.params.id);

  if (user) {
    const { password, ...userWithoutPassword } = user; // Exclude password
    res.json(userWithoutPassword);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// POST /users route - create a new user
app.post('/users', (req, res) => {
  const { username, password, name, email, phoneNumber, profilePicture } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ message: 'Username, password, and email are required' });
  }

  const users = getUsers();
  const existingUser = users.find(u => u.username === username);
  if (existingUser) {
    return res.status(409).json({ message: 'Username already exists' });
  }

  const newUser = { id: uuidv4(), username, password, name, email, phoneNumber, profilePicture };
  users.push(newUser);
  saveUsers(users);

  const { password: _, ...userWithoutPassword } = newUser;
  res.status(201).json(userWithoutPassword);
});

// Generic CRUD routes for hosts, properties, amenities, bookings, and reviews
const setupCrudRoutes = (resourceName) => {
  // Special handling for hosts to exclude passwords and filter by name
  if (resourceName === 'hosts') {
    app.get(`/${resourceName}`, (req, res) => {
      let hosts = getData(resourceName);
      // Exclude passwords from the returned hosts
      const hostsWithoutPassword = hosts.map(({ password, ...host }) => host);

      // Apply query filtering (by name)
      if (req.query.name) {
        const nameQuery = req.query.name.toLowerCase();
        hosts = hostsWithoutPassword.filter(host => host.name.toLowerCase() === nameQuery);
      }

      res.json(hostsWithoutPassword);
    });

    app.delete(`/${resourceName}/:id`, (req, res) => {
      let data = getData(resourceName);
      const newData = data.filter((item) => item.id !== req.params.id);
      if (data.length !== newData.length) {
        saveData(resourceName, newData);
        res.status(200).json({ message: 'Host deleted successfully' });
      } else {
        res.status(404).json({ message: 'Host not found' });
      }
    });
  } 
  
  // Handle /properties with filters for location, pricePerNight, and amenities
  else if (resourceName === 'properties') {
    app.get(`/${resourceName}`, (req, res) => {
      let properties = getData(resourceName);

      // Apply filtering based on query parameters
      if (req.query.location) {
        const locationQuery = req.query.location.toLowerCase();
        properties = properties.filter(property => property.location.toLowerCase() === locationQuery);
      }

      if (req.query.pricePerNight) {
        const priceQuery = parseFloat(req.query.pricePerNight);
        properties = properties.filter(property => property.pricePerNight <= priceQuery);
      }

      if (req.query.amenities) {
        const amenitiesQuery = req.query.amenities.toLowerCase();
        properties = properties.filter(property =>
          property.amenities && property.amenities.toLowerCase().includes(amenitiesQuery)
        );
      }

      res.json(properties);
    });
  } 
  
  // Handle /bookings with filtering by userId
  else if (resourceName === 'bookings') {
    app.get(`/${resourceName}`, (req, res) => {
      let bookings = getData(resourceName);
      
      // Apply filtering based on query parameters (userId)
      if (req.query.userId) {
        bookings = bookings.filter(booking => booking.userId === req.query.userId);
      }

      res.json(bookings);
    });
  }

  // GET /[resourceName]/:id - fetch by ID
  app.get(`/${resourceName}/:id`, (req, res) => {
    const data = getData(resourceName);
    const item = data.find((item) => item.id === req.params.id);
    if (item) {
      res.json(item);
    } else {
      res.status(404).json({ message: `${resourceName.slice(0, -1)} not found` });
    }
  });

  // POST /[resourceName] - create new resource
  app.post(`/${resourceName}`, (req, res) => {
    const data = getData(resourceName);
    const newItem = { id: uuidv4(), ...req.body };
    data.push(newItem);
    saveData(resourceName, data);
    res.status(201).json(newItem);
  });

  // PUT /[resourceName]/:id - update resource by ID
  app.put(`/${resourceName}/:id`, (req, res) => {
    const data = getData(resourceName);
    const index = data.findIndex((item) => item.id === req.params.id);
    if (index !== -1) {
      data[index] = { ...data[index], ...req.body };
      saveData(resourceName, data);
      res.json(data[index]);
    } else {
      res.status(404).json({ message: `${resourceName.slice(0, -1)} not found` });
    }
  });

  // DELETE /[resourceName]/:id - delete resource by ID
  app.delete(`/${resourceName}/:id`, (req, res) => {
    let data = getData(resourceName);
    const newData = data.filter((item) => item.id !== req.params.id);
    if (data.length !== newData.length) {
      saveData(resourceName, newData);
      res.status(204).send();
    } else {
      res.status(404).json({ message: `${resourceName.slice(0, -1)} not found` });
    }
  });
};

// CRUD Routes for amenities

// GET /amenities - Fetch all amenities
app.get('/amenities', (req, res) => {
  const amenities = getData('amenities');
  res.json(amenities);
});

// GET /amenities/:id - Fetch a single amenity by ID
app.get('/amenities/:id', (req, res) => {
  const amenities = getData('amenities');
  const amenity = amenities.find(a => a.id === req.params.id);
  if (amenity) {
    res.json(amenity);
  } else {
    res.status(404).json({ message: 'Amenity not found' });
  }
});

// POST /amenities - Create a new amenity
app.post('/amenities', (req, res) => {
  const amenities = getData('amenities');
  const newAmenity = { id: uuidv4(), ...req.body };
  amenities.push(newAmenity);
  saveData('amenities', amenities);
  res.status(201).json(newAmenity);
});

// PUT /amenities/:id - Update an existing amenity
app.put('/amenities/:id', (req, res) => {
  const amenities = getData('amenities');
  const index = amenities.findIndex(a => a.id === req.params.id);
  if (index !== -1) {
    amenities[index] = { ...amenities[index], ...req.body };
    saveData('amenities', amenities);
    res.json(amenities[index]);
  } else {
    res.status(404).json({ message: 'Amenity not found' });
  }
});

// DELETE /amenities/:id - Delete an amenity
app.delete('/amenities/:id', (req, res) => {
  const amenities = getData('amenities');
  const newAmenities = amenities.filter(a => a.id !== req.params.id);
  if (amenities.length !== newAmenities.length) {
    saveData('amenities', newAmenities);
    res.status(200).json({ message: 'Amenity deleted successfully' });
  } else {
    res.status(404).json({ message: 'Amenity not found' });
  }
});

// CRUD Routes for reviews

// GET /reviews - Fetch all reviews
app.get('/reviews', (req, res) => {
  const reviews = getData('reviews');
  res.json(reviews);
});

// GET /reviews/:id - Fetch a single review by ID
app.get('/reviews/:id', (req, res) => {
  const reviews = getData('reviews');
  const review = reviews.find(r => r.id === req.params.id);
  if (review) {
    res.json(review);
  } else {
    res.status(404).json({ message: 'Review not found' });
  }
});

// POST /reviews - Create a new review
app.post('/reviews', (req, res) => {
  const reviews = getData('reviews');
  const newReview = { id: uuidv4(), ...req.body };
  reviews.push(newReview);
  saveData('reviews', reviews);
  res.status(201).json(newReview);
});

// PUT /reviews/:id - Update an existing review
app.put('/reviews/:id', (req, res) => {
  const reviews = getData('reviews');
  const index = reviews.findIndex(r => r.id === req.params.id);
  if (index !== -1) {
    reviews[index] = { ...reviews[index], ...req.body };
    saveData('reviews', reviews);
    res.json(reviews[index]);
  } else {
    res.status(404).json({ message: 'Review not found' });
  }
});

// DELETE /reviews/:id - Delete a review
app.delete('/reviews/:id', (req, res) => {
  const reviews = getData('reviews');
  const newReviews = reviews.filter(r => r.id !== req.params.id);
  if (reviews.length !== newReviews.length) {
    saveData('reviews', newReviews);
    res.status(200).json({ message: 'Review deleted successfully' });
  } else {
    res.status(404).json({ message: 'Review not found' });
  }
});


// Setup CRUD routes for hosts, properties, amenities, bookings, and reviews
setupCrudRoutes('hosts');
setupCrudRoutes('properties');
setupCrudRoutes('amenities');
setupCrudRoutes('bookings');
setupCrudRoutes('reviews');

// Example route to test error handling
app.get('/error', (req, res) => {
  throw new Error('Example error');
});

// Sentry error handler middleware to capture unhandled errors
app.use(Sentry.Handlers.errorHandler());

// Custom error handler (imported from errorHandling.js)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
