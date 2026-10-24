import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema(
  {
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true },
    filePath: { type: String, required: true },
    line: { type: Number, required: true },
    severity: { type: String, enum: ['critical', 'warning', 'suggestion'], required: true },
    category: { type: String, default: '' },
    message: { type: String, required: true },
    suggestion: { type: String, default: '' },
  },
  { timestamps: true }
);

findingSchema.index({ review: 1 });

export default mongoose.model('Finding', findingSchema);