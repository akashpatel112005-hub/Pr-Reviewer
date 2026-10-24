import mongoose from 'mongoose';

const pullRequestSchema = new mongoose.Schema(
  {
    repoFullName: { type: String, required: true },
    prNumber: { type: Number, required: true },
    title: { type: String, default: '' },
    author: { type: String, default: '' },
    htmlUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

pullRequestSchema.index({ repoFullName: 1, prNumber: 1 }, { unique: true });

export default mongoose.model('PullRequest', pullRequestSchema);