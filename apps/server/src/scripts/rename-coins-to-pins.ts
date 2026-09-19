/* eslint-disable custom-rules/no-comments */
/**
 * MIGRATION SCRIPT: Rename "pins" to "pins"
 * 
 * IMPORTANT: This script MUST be run exactly once against the production
 * database BEFORE deploying the renamed application code.
 * 
 * It renames the `pins` field to `pins` across all documents in the
 * `playerProfiles` collection.
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'flagora';

async function runMigration() {
  console.log('Connecting to MongoDB...', MONGODB_URI);
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected.');
    
    const db = client.db(DB_NAME);
    const collection = db.collection('playerProfiles');

    console.log('Running migration: rename pins to pins...');
    
    const result = await collection.updateMany(
      { pins: { $exists: true } },
      { $rename: { pins: 'pins' } }
    );

    console.log(`Migration complete. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('Disconnected.');
  }
}

runMigration().catch(console.error);
