import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import db from './database'; // Import the database module
import offerRoutes from './routes/offers'; // Import the offer routes

const app: Express = express();
const port: string | number = process.env.PORT || 3001;

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Middleware to parse JSON bodies

// Use the offer routes
app.use('/api/offers', offerRoutes);

// Basic error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});