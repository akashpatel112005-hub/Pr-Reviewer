import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.error('Check MONGODB_URI and that your IP is allowed in Atlas Network Access.');
    process.exit(1);
  }
}