import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import Job from '../src/models/Job.js';

await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
const result = await Job.deleteMany({ deliveryId: /^(test-|rerun-)/ });
console.log(`Deleted ${result.deletedCount} test job(s)`);
await mongoose.disconnect();