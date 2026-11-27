"use client";

import clsx from "clsx";
import { LoaderCircle } from "lucide-react";

export function Button({ children, className, variant = "primary", busy, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean }) {
  return <button className={clsx("btn", `btn-${variant}`, className)} disabled={props.disabled || busy} {...props}>
    {busy && <LoaderCircle size={17} className="spin" />}{children}
  </button>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={clsx("card", className)}>{children}</section>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function StatCard({ label, value, hint, icon, tone = "blue" }: { label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; tone?: "blue" | "green" | "amber" | "slate" }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-copy"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></div>;
}

export function ProgressBar({ value, tone = "blue" }: { value: number; tone?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return <div className="progress-track"><div className={`progress-fill ${tone}`} style={{ width: `${safe}%` }} /></div>;
}

export function LoadingState({ label = "جارٍ تحميل البيانات…" }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-mark">✦</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "success" | "error" | "warning" }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}
