import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '../src/database.js';
import { createBackup, restoreBackup } from '../src/backup-service.js';

test('an SQLite backup restores workspace content and preserves later suppressions', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bulk-mail-backup-'));
  const db = openDatabase(path.join(folder, 'active.sqlite'));
  const backup = path.join(folder, 'snapshot.sqlite');
  const now = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO users (id,full_name,username,email,password_hash,role,created_at,updated_at) VALUES ('admin','Admin Name','admin','admin@example.test','unused','super_admin',?,?)",
    ).run(now, now);
    db.prepare(
      "INSERT INTO contact_lists VALUES ('old','Original list','',?,?)",
    ).run(now, now);
    db.prepare(
      "INSERT INTO user_sessions VALUES ('session','admin','2099')",
    ).run();
    assert.equal((await createBackup(db, backup)).ok, true);
    db.prepare(
      "INSERT INTO contact_lists VALUES ('new','New list','',?,?)",
    ).run(now, now);
    db.prepare(
      "INSERT INTO suppression_list VALUES ('former@example.test','unsubscribed','test',?)",
    ).run(now);
    assert.equal((await restoreBackup(db, backup)).ok, true);
    assert.deepEqual(db.prepare('SELECT id FROM contact_lists').pluck().all(), [
      'old',
    ]);
    assert.equal(
      db.prepare('SELECT email FROM suppression_list').pluck().get(),
      'former@example.test',
    );
    assert.equal(
      db.prepare('SELECT count(*) FROM user_sessions').pluck().get(),
      0,
    );
  } finally {
    db.close();
    await Promise.all([
      rm(backup, { force: true }),
      rm(path.join(folder, 'active.sqlite'), { force: true }),
    ]);
    await rmdir(folder);
  }
});
