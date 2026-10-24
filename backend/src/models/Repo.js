import mongoose from 'mongoose';

const repoSchema = new mongoose.Schema(
  {
    installationId: { type: Number, required: true },
    repoFullName: { type: String, required: true },
    githubRepoId: { type: Number },
    isPrivate: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

repoSchema.index({ installationId: 1, repoFullName: 1 }, { unique: true });
repoSchema.index({ repoFullName: 1 });

export default mongoose.model('Repo', repoSchema);
