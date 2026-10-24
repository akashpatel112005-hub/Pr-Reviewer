import mongoose from 'mongoose';

const installationSchema = new mongoose.Schema(
  {
    installationId: { type: Number, required: true, unique: true },
    accountLogin: { type: String, default: '' },
    accountType: { type: String, enum: ['User', 'Organization'], default: 'User' },
    repositorySelection: { type: String, default: 'all' },
    suspended: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Installation', installationSchema);
