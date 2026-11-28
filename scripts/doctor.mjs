import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];
const notes = [];

const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

function parseEnvFile(filePath) {
  const result = new Map();
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result.set(match[1], value);
  }

  return result;
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(major) || major < 22 || major >= 23) {
  errors.push(
    `Node.js 22 مطلوب. الإصدار الحالي: ${process.versions.node}`,
  );
} else {
  notes.push(`Node.js ${process.versions.node}: متوافق.`);
}

for (const requiredPath of [
  "package.json",
  "tsconfig.json",
  ".env.example",
  "src/app",
  "supabase/migrations",
  "tests",
]) {
  if (!exists(requiredPath)) errors.push(`ملف/مجلد مطلوب غير موجود: ${requiredPath}`);
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

for (const scriptName of ["dev", "build", "typecheck", "test:rules"]) {
  if (!packageJson.scripts?.[scriptName]) {
    errors.push(`أمر npm مفقود: ${scriptName}`);
  }
}

if (!exists("package-lock.json")) {
  warnings.push(
    "package-lock.json غير موجود؛ تثبيت الاعتماديات غير مثبت بإصدارات مقفلة بعد.",
  );
}

const envExample = parseEnvFile(path.join(root, ".env.example"));
const requiredEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

for (const key of requiredEnvKeys) {
  if (!envExample.has(key)) {
    errors.push(`المتغير ${key} غير موثق في .env.example.`);
  }
}

const localEnvPath = path.join(root, ".env.local");
const requireEnv = process.argv.includes("--require-env");

if (!fs.existsSync(localEnvPath)) {
  const message = "ملف .env.local غير موجود؛ انسخ .env.example وأضف بيانات Supabase.";
  (requireEnv ? errors : warnings).push(message);
} else {
  const localEnv = parseEnvFile(localEnvPath);

  for (const key of requiredEnvKeys) {
    const value = localEnv.get(key);
    if (!value || /YOUR_PROJECT_REF|REPLACE_ME|your-project/i.test(value)) {
      errors.push(`المتغير ${key} غير مضبوط في .env.local.`);
    }
  }

  const secretKeys = [...localEnv.keys()].filter((key) =>
    /SERVICE_ROLE|SECRET_KEY/i.test(key),
  );

  if (secretKeys.length > 0) {
    warnings.push(
      "عُثر على متغيرات تبدو كمفاتيح سرية. التطبيق لا يحتاج Service Role Key؛ لا تضعها تحت NEXT_PUBLIC_* ولا ترفعها إلى Git.",
    );
  } else {
    notes.push("لم يُعثر على أسماء متغيرات Service Role/Secret في .env.local.");
  }
}

const gitignore = exists(".gitignore")
  ? fs.readFileSync(path.join(root, ".gitignore"), "utf8")
  : "";

if (!/^\.env\.\*$/m.test(gitignore) || !/^!\.env\.example$/m.test(gitignore)) {
  warnings.push(
    "تحقق من .gitignore: يجب تجاهل ملفات .env.* مع السماح بملف .env.example.",
  );
}

console.log("\nCHALLENGE Workspace Doctor\n");

for (const note of notes) console.log(`✓ ${note}`);
for (const warning of warnings) console.warn(`! ${warning}`);
for (const error of errors) console.error(`✗ ${error}`);

if (errors.length > 0) {
  console.error(`\nفشل الفحص: ${errors.length} مشكلة.`);
  process.exitCode = 1;
} else {
  console.log("\nنجح فحص الأساس. راجع التحذيرات قبل تشغيل التطبيق أو نشره.");
}
