import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { User } from '../models/user.model';

/**
 * Grants or revokes the ADMIN role, from the command line, on purpose.
 *
 * Promoting somebody to administrator is the single most consequential change
 * anyone can make to a ZyCart deployment: it hands over the catalogue, every
 * order, every customer record and the moderation queue. That is why there is
 * no role dropdown anywhere in the admin console, and why this lives here
 * instead — a deliberate act by somebody with database credentials and shell
 * access, not a click by somebody who already has a session.
 *
 * It changes one field on one account, addressed by email. It creates nothing,
 * deletes nothing, and touches no other document.
 *
 *   pnpm make-admin you@example.com
 *   pnpm make-admin you@example.com --revoke
 *   pnpm make-admin --list
 */
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const listOnly = args.includes('--list');
  const email = args
    .find((arg) => !arg.startsWith('--'))
    ?.trim()
    .toLowerCase();

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}\n`);

  if (listOnly) {
    const admins = await User.find({ role: 'ADMIN' }).select('email firstName lastName isActive');

    if (admins.length === 0) {
      console.log('No administrators.');
      console.log('Grant the role with:  pnpm make-admin you@example.com');
    } else {
      console.log(`${admins.length} administrator(s):`);
      for (const admin of admins) {
        console.log(
          `  ${admin.email}  (${admin.firstName} ${admin.lastName})${admin.isActive ? '' : '  [deactivated]'}`,
        );
      }
    }

    await mongoose.disconnect();
    return;
  }

  if (!email) {
    console.error('Usage: pnpm make-admin <email> [--revoke]');
    console.error('       pnpm make-admin --list');
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  const user = await User.findOne({ email }).select('email firstName lastName role isActive');

  if (!user) {
    // Deliberately does not create the account: an administrator should be
    // somebody who already signed up and whose password you did not set.
    console.error(`No account found for ${email}.`);
    console.error('Register through the storefront first, then run this again.');
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  const next = revoke ? 'USER' : 'ADMIN';

  if (user.role === next) {
    console.log(`${user.email} is already ${next}. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  await User.updateOne({ _id: user._id }, { $set: { role: next } });

  console.log(`${user.email}: ${user.role} → ${next}`);

  if (next === 'ADMIN') {
    console.log('\nSign out and back in, then open /admin.');
    if (!user.isActive) {
      console.log('Note: this account is deactivated, so it cannot sign in until reactivated.');
    }
  }

  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
