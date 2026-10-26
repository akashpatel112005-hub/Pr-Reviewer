import express, { Router } from 'express';
import { env } from '../config/env.js';
import Job from '../models/Job.js';
import Installation from '../models/Installation.js';
import Repo from '../models/Repo.js';
import User from '../models/User.js';
import { verifySignature } from '../services/webhookSecurity.js';
import { classifyEvent } from '../services/webhookEvents.js';

const router = Router();
const DELIVERY_RE = /^[A-Za-z0-9._:-]{1,100}$/;

// express.raw keeps the exact bytes GitHub signed. The JSON parser would destroy them.
router.post('/', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  if (!env.githubWebhookSecret) {
    console.error('Webhook received but GITHUB_WEBHOOK_SECRET is not set');
    return res.status(503).json({ error: 'Webhook is not configured' });
  }

  if (!verifySignature(req.body, req.get('x-hub-signature-256'), env.githubWebhookSecret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.get('x-github-event') || '';
  const deliveryId = req.get('x-github-delivery') || '';
  if (!DELIVERY_RE.test(deliveryId)) {
    return res.status(400).json({ error: 'Missing or invalid X-GitHub-Delivery header' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Body is not valid JSON. Set the webhook content type to application/json.' });
  }

  const result = classifyEvent(event, payload);
  if (result.type === 'ping') return res.status(200).json({ status: 'pong' });
  if (result.type === 'ignore') return res.status(200).json({ status: 'ignored', reason: result.reason });
  if (result.type === 'invalid') return res.status(400).json({ error: `Invalid payload: ${result.reason}` });

  // Handle installation events (sync installations & connected repositories)
  if (result.type === 'installation') {
    try {
      if (result.action === 'created') {
        await Installation.findOneAndUpdate(
          { installationId: result.installationId },
          {
            $set: {
              accountLogin: result.accountLogin,
              accountType: result.accountType,
              repositorySelection: result.repositorySelection,
              suspended: false,
            },
          },
          { upsert: true }
        );

        if (result.repositories && result.repositories.length > 0) {
          const ops = result.repositories.map((r) => ({
            updateOne: {
              filter: { installationId: result.installationId, repoFullName: r.fullName },
              update: { $set: { githubRepoId: r.id, isPrivate: r.isPrivate, enabled: true } },
              upsert: true,
            },
          }));
          await Repo.bulkWrite(ops);
        }

        if (result.senderGithubId) {
          await User.updateOne(
            { githubId: result.senderGithubId },
            { $addToSet: { installationIds: result.installationId } }
          );
        }
      } else if (result.action === 'deleted') {
        await Installation.deleteOne({ installationId: result.installationId });
        await Repo.updateMany({ installationId: result.installationId }, { $set: { enabled: false } });
        await User.updateMany(
          { installationIds: result.installationId },
          { $pull: { installationIds: result.installationId } }
        );
      } else if (result.action === 'suspend') {
        await Installation.updateOne({ installationId: result.installationId }, { $set: { suspended: true } });
      } else if (result.action === 'unsuspend') {
        await Installation.updateOne({ installationId: result.installationId }, { $set: { suspended: false } });
      }

      return res.status(200).json({ status: 'synced', action: result.action });
    } catch (err) {
      console.error('Error handling installation webhook:', err.message);
      return res.status(500).json({ error: 'Failed to sync installation' });
    }
  }

  // Handle installation_repositories added or removed
  if (result.type === 'installation_repositories') {
    try {
      if (result.action === 'added' && result.added?.length) {
        const ops = result.added.map((r) => ({
          updateOne: {
            filter: { installationId: result.installationId, repoFullName: r.fullName },
            update: { $set: { githubRepoId: r.id, isPrivate: r.isPrivate, enabled: true } },
            upsert: true,
          },
        }));
        await Repo.bulkWrite(ops);
      } else if (result.action === 'removed' && result.removed?.length) {
        const names = result.removed.map((r) => r.fullName);
        await Repo.updateMany(
          { installationId: result.installationId, repoFullName: { $in: names } },
          { $set: { enabled: false } }
        );
      }
      return res.status(200).json({ status: 'synced', action: result.action });
    } catch (err) {
      console.error('Error handling installation_repositories webhook:', err.message);
      return res.status(500).json({ error: 'Failed to sync installation repositories' });
    }
  }

  // Handle pull_request event -> Enqueue review job
  if (result.type === 'enqueue') {
    // If installationId is provided, check if the repo is known and enabled
    if (result.job.installationId) {
      try {
        const repoDoc = await Repo.findOne({
          installationId: result.job.installationId,
          repoFullName: result.job.repoFullName,
        });

        // If repo exists and reviews were explicitly paused by the user, ignore
        if (repoDoc && repoDoc.enabled === false) {
          return res.status(200).json({
            status: 'ignored',
            reason: `reviews are paused for ${result.job.repoFullName}`,
          });
        }

        // If repo document does not exist yet, auto-register it as enabled
        if (!repoDoc) {
          await Repo.create({
            installationId: result.job.installationId,
            repoFullName: result.job.repoFullName,
            githubRepoId: payload.repository?.id || 0,
            isPrivate: Boolean(payload.repository?.private),
            enabled: true,
          }).catch((e) => console.warn('Could not auto-register repo on webhook:', e.message));
        }
      } catch (err) {
        console.error('Error checking repository registration:', err.message);
        return res.status(500).json({ error: 'Database check failed' });
      }
    }

    try {
      const job = await Job.create({ deliveryId, ...result.job });
      return res.status(200).json({ status: 'queued', jobId: String(job._id) });
    } catch (err) {
      // The unique index on deliveryId rejects a replayed delivery.
      if (err?.code === 11000) {
        return res.status(200).json({ status: 'duplicate', reason: 'this delivery was already received' });
      }
      console.error('Failed to queue job:', err.message);
      return res.status(500).json({ error: 'Could not queue the job' });
    }
  }

  return res.status(200).json({ status: 'unhandled' });
});

export default router;
