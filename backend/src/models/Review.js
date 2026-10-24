import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    pullRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'PullRequest', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    headSha: { type: String, required: true },
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
    summary: { type: String, default: '' },
    changes: { type: [String], default: [] },
    summaryError: { type: String, default: null },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', null], default: null },
    riskReason: { type: String, default: '' },
    filesReviewed: { type: Number, default: 0 },
    filesSkipped: { type: [{ file: String, reason: String, _id: false }], default: [] },
    warnings: { type: [String], default: [] },
    findingsCount: { type: Number, default: 0 },
    inlineCount: { type: Number, default: 0 },
    posted: { type: Boolean, default: false },
    githubReviewUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

// One review per commit. Re-running the same commit updates it instead of duplicating it.
reviewSchema.index({ pullRequest: 1, headSha: 1 }, { unique: true });
reviewSchema.index({ pullRequest: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);