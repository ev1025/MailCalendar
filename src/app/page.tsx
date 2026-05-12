"use client";

import { Suspense } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Calendar,
  Plane,
  Wallet,
  ShoppingBag,
  BookOpen,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import PageHeader from "@/components/layout/page-header";
import { useCurrentUser } from "@/lib/current-user";
import { useTransactions } from "@/hooks/use-transactions";

const KRW = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

function monthRange(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const pad = (x: number) => String(x).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(last)}`,
    label: `${m + 1}월`,
  };
}

const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const, delay },
});

const QUICK_LINKS = [
  { href: "/calendar", label: "캘린더", desc: "일정·날씨", icon: Calendar },
  { href: "/travel", label: "여행", desc: "여행지·계획", icon: Plane },
  { href: "/finance", label: "가계부", desc: "지출·수입", icon: Wallet },
  { href: "/products", label: "쇼핑기록", desc: "제품 단가 추적", icon: ShoppingBag },
  { href: "/knowledge", label: "지식창고", desc: "노트·폴더", icon: BookOpen },
] as const;

function FinanceCard() {
  const { start, end, label } = monthRange();
  const { totalIncome, totalExpense, balance, loading } = useTransactions(start, end);
  return (
    <Link
      href="/finance"
      className="group block rounded-2xl border bg-card p-4 ring-1 ring-foreground/5 transition-shadow hover:shadow-sm md:p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-color-soft text-accent-color ring-1 ring-accent-color/20">
            <Wallet className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-bold">{label} 가계부</h2>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      {loading ? (
        <div className="h-12 animate-pulse rounded-lg bg-muted/60" />
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[11px] text-muted-foreground">수입</p>
            <p className="text-sm font-semibold tabular-nums text-finance-gain">{KRW(totalIncome)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">지출</p>
            <p className="text-sm font-semibold tabular-nums text-finance-loss">{KRW(totalExpense)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">잔액</p>
            <p
              className={`text-sm font-bold tabular-nums ${
                balance > 0
                  ? "text-finance-gain"
                  : balance < 0
                    ? "text-finance-loss"
                    : "text-muted-foreground"
              }`}
            >
              {KRW(balance)}
            </p>
          </div>
        </div>
      )}
    </Link>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const currentUser = useCurrentUser();
  const now = new Date();
  const dateLabel = now.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <>
      <PageHeader title="홈" showBell />
      <div className="mx-auto max-w-2xl px-4 py-5 md:px-6 md:py-6">
        <motion.div {...reveal(0.02)} className="mb-5">
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
          <h1 className="mt-0.5 font-[family-name:var(--font-montserrat)] text-2xl font-black tracking-tight text-foreground">
            안녕하세요{currentUser?.name ? `, ${currentUser.name}` : ""} 👋
          </h1>
        </motion.div>

        <motion.div {...reveal(0.08)} className="mb-5">
          <FinanceCard />
        </motion.div>

        <motion.div {...reveal(0.14)}>
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            바로가기
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {QUICK_LINKS.map(({ href, label, desc, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-1.5 rounded-2xl border bg-card p-3.5 ring-1 ring-foreground/5 transition-all hover:shadow-sm hover:ring-accent-color/30"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-color-soft text-accent-color ring-1 ring-accent-color/20">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold">
                  {label}
                  <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="text-[11px] text-muted-foreground">{desc}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </>
  );
}
