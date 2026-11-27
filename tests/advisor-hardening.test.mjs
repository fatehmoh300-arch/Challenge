import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/202611270003_advisor_hardening.sql", import.meta.url),
  "utf8",
);

test("anonymous role cannot execute security-definer application RPCs", () => {
  for (const signature of [
    "public.is_challenge_member(uuid)",
    "public.create_challenge(text, date, date)",
    "public.create_invitation(uuid, integer)",
    "public.join_challenge(text)",
    "public.validate_user_day(uuid, uuid, date)",
    "public.get_challenge_leaderboard(uuid)",
  ]) {
    assert.ok(
      migration.includes(`revoke execute on function ${signature} from anon;`),
      `missing anon revoke for ${signature}`,
    );
  }
});

test("foreign-key lookup indexes are created", () => {
  for (const name of [
    "idx_challenges_owner_user_id",
    "idx_habit_completions_habit_challenge",
    "idx_invitations_challenge_id",
    "idx_invitations_created_by",
  ]) {
    assert.ok(migration.includes(name), `missing index ${name}`);
  }
});

test("RLS identity checks use statement-level auth.uid evaluation", () => {
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /owner_user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /user_id = auth\.uid\(\)/);
});
