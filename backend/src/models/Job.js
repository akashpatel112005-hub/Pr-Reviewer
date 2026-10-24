import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    deliveryId: { type: String, required: true, unique: true },
    repoFullName: { type: String, required: true },
    prNumber: { type: Number, required: true },
    headSha: { type: String, required: true },
    installationId: { type: Number },
    status: {
      type: String,
      enum: ['queued', 'processing', 'done', 'failed'],
      default: 'queued',
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAt: { type: Date, default: Date.now },
    lockedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, runAt: 1 });

export default mongoose.model('Job', jobSchema);