import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/202611270002_hardening_and_scoring.sql", import.meta.url),
  "utf8",
);

test("security-definer functions pin an empty search_path", () => {
  for (const signature of [
    "public.handle_new_user()",
    "public.is_challenge_member(uuid)",
    "public.create_challenge(text, date, date)",
    "public.create_invitation(uuid, integer)",
    "public.join_challenge(text)",
    "public.validate_user_day(uuid, uuid, date)",
    "public.get_challenge_leaderboard(uuid)",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function ${signature.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")} set search_path = '';`, "i"),
    );
  }
});

test("the optional fasting bonus does not gate full days or streaks", () => {
  assert.match(migration, /core_points = 5/);
  assert.match(migration, /coalesce\(h\.is_fasting, false\) = false/);
  assert.match(migration, /where core_points = 5/);
});

test("members can read only their own membership row", () => {
  assert.match(migration, /create policy members_select_self[\s\S]*?using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(migration, /create policy members_select_member/i);
});

test("reading history keeps an explicitly supplied book title", () => {
  assert.match(migration, /if new\.book_title is null or pg_catalog\.btrim\(new\.book_title\) = '' then/i);
});
