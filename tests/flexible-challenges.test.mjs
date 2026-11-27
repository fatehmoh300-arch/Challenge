import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("challenge creation no longer seeds a December template or fixed habits", async () => {
  const migration = await read("../supabase/migrations/20261127070000_flexible_challenges_progression.sql");
  const start = migration.indexOf("create or replace function public.create_challenge_v2(");
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const createBody = migration.slice(start, end);
  assert.match(createBody, /p_start_date date/);
  assert.match(createBody, /p_end_date date/);
  assert.doesNotMatch(createBody, /insert into public\.habits/i);
  assert.match(migration, /create or replace function public\.create_challenge_goal/);
});

test("multi-challenge memberships and challenge switching are wired in the app", async () => {
  const provider = await read("../src/components/app-provider.tsx");
  const list = await read("../src/app/(app)/challenges/page.tsx");
  assert.match(provider, /memberships: ChallengeMembership\[\]/);
  assert.match(provider, /selectChallenge/);
  assert.match(provider, /\.in\("id", ids\)/);
  assert.match(list, /create_challenge_v2/);
  assert.match(list, /selectChallenge\(item\.id\)/);
});

test("progression levels use the approved cumulative XP thresholds", async () => {
  const page = await read("../src/app/(app)/achievements/page.tsx");
  for (const threshold of [0, 100, 300, 700, 1500, 3000]) {
    assert.match(page, new RegExp(`min:\\s*${threshold}\\b`));
  }
  assert.match(page, /get_my_progress/);
  assert.match(page, /get_my_awards/);
});

test("challenge completion creates top-three awards and locks further changes", async () => {
  const migration = await read("../supabase/migrations/20261127070000_flexible_challenges_progression.sql");
  assert.match(migration, /create table if not exists public\.challenge_awards/);
  assert.match(migration, /create or replace function public\.set_challenge_status/);
  assert.match(migration, /row_number\(\) over\(order by lb\.points desc/);
  assert.match(migration, /تم اعتماد جوائز التحدّي/);
});

test("community data has RLS and member-only policies", async () => {
  const migration = await read("../supabase/migrations/20261127070000_flexible_challenges_progression.sql");
  assert.match(migration, /alter table public\.challenge_posts enable row level security/);
  assert.match(migration, /alter table public\.challenge_comments enable row level security/);
  assert.match(migration, /public\.is_challenge_member\(challenge_id\)/);
});
