import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    githubId: { type: Number, required: true, unique: true },
    login: { type: String, required: true },
    name: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    installationIds: { type: [Number], default: [] },
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
