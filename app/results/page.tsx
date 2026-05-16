'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';
import { ArrowLeft, FileText, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import Link from 'next/link';
import VideoBackground from '@/components/VideoBackground';
import AgentSwarm, { type AgentStatus } from '@/components/AgentSwarm';
import Footer from '@/components/Footer';
import {
  DEMO_REPORT,
  AGENTS,
  getRiskColor,
  getRiskLabel,
  type AgentId,
} from '@/lib/demoData';
import ComplaintModal from '@/components/ComplaintModal';

// Lazy-load the Three.js globe to avoid SSR issues
const Globe = dynamic(() => import('@/components/Globe'), { ssr: false });

const AGENT_SEQUENCE_MS = [400, 1200, 2200, 3400, 4800];

export default function ResultsPage() {
  const [statuses, setStatuses] = useState<Record<AgentId, AgentStatus>>(
    Object.fromEntries(AGENTS.map((a) => [a.id, 'pending'])) as Record<AgentId, AgentStatus>
  );
  const [showModal, setShowModal] = useState(false);

  // Animate agents completing one by one
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    AGENTS.forEach((agent, i) => {
      // Mark running
      timers.push(
        setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [agent.id]: 'running' }));
        }, AGENT_SEQUENCE_MS[i])
      );
      // Mark complete 900ms after starting
      timers.push(
        setTimeout(() => {
          setStatuses((prev) => ({ ...prev, [agent.id]: 'complete' }));
        }, AGENT_SEQUENCE_MS[i] + 900)
      );
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  const allComplete = Object.values(statuses).every((s) => s === 'complete');

  return (
    <div className="relative min-h-screen flex flex-col">
      <VideoBackground />

      {/* Top nav */}
      <nav className="relative z-10 flex items-center gap-4 px-6 py-4">
        <Link
          href="/"
          className="liquid-glass flex items-center gap-2 px-3 py-2 rounded-xl text-white/70 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          New Analysis
        </Link>
        <div className="flex-1" />
        <div className="liquid-glass px-4 py-2 rounded-xl text-sm text-white/60">
          <span className="text-white font-medium">{DEMO_REPORT.company}</span>
          <span className="mx-2 text-white/30">·</span>
          Supply Chain Intelligence Report
        </div>
      </nav>

      {/* Main 3-column layout */}
      <main className="relative z-10 flex-1 grid grid-cols-[280px_1fr_420px] gap-4 px-4 pb-4" style={{ minHeight: 0 }}>
        {/* LEFT: Agent Swarm */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="flex flex-col gap-4"
        >
          <AgentSwarm statuses={statuses} />

          {/* Risk legend */}
          <div className="liquid-glass rounded-2xl p-4">
            <p className="text-white/40 text-xs tracking-widest uppercase mb-3">Risk Scale</p>
            {[
              { score: 5, label: 'Critical' },
              { score: 4, label: 'High' },
              { score: 3, label: 'Medium' },
              { score: 2, label: 'Low' },
            ].map(({ score, label }) => (
              <div key={score} className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: getRiskColor(score) }}
                />
                <span className="text-white/60 text-xs">{score} — {label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CENTER: Report panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="liquid-glass rounded-2xl p-6 overflow-y-auto flex flex-col gap-6"
        >
          {/* Executive summary */}
          <section>
            <SectionHeader icon={<Info size={14} />} title="Executive Summary" />
            <p className="text-white/70 text-sm leading-relaxed mt-2">{DEMO_REPORT.executiveSummary}</p>
          </section>

          {/* Supplier risk table */}
          <section>
            <SectionHeader icon={<AlertTriangle size={14} />} title="Supplier Risk Table" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {['Supplier', 'Country', 'Risk', 'Credibility', 'Sources'].map((h) => (
                      <th key={h} className="text-left text-white/40 text-xs pb-2 pr-4 font-normal tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEMO_REPORT.suppliers.map((s) => (
                    <tr key={s.id} className="border-b border-white/5">
                      <td className="py-2.5 pr-4 text-white text-xs font-medium">{s.name}</td>
                      <td className="py-2.5 pr-4 text-white/60 text-xs">{s.country}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            color: getRiskColor(s.riskScore),
                            background: `${getRiskColor(s.riskScore)}20`,
                          }}
                        >
                          {s.riskScore}/5 {getRiskLabel(s.riskScore)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className="w-2 h-2 rounded-full"
                              style={{
                                background: i < s.credibilityScore ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.1)',
                              }}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 text-white/40 text-xs">{s.sources[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Key findings */}
          <section>
            <SectionHeader icon={<AlertTriangle size={14} />} title="Key Findings" />
            <div className="mt-3 flex flex-col gap-2">
              {DEMO_REPORT.keyFindings.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.15 }}
                  className="flex gap-3 p-3 rounded-xl bg-white/5"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-white/40 text-xs mb-0.5">{f.agent}</p>
                    <p className="text-white/80 text-xs leading-relaxed">{f.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Recommended actions */}
          <section>
            <SectionHeader icon={<CheckCircle size={14} />} title="Recommended Actions" />
            <div className="mt-3 flex flex-col gap-2">
              {DEMO_REPORT.recommendedActions.map((a, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl bg-white/5">
                  <PriorityBadge priority={a.priority} />
                  <p className="text-white/80 text-xs leading-relaxed">{a.action}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Complaint letter button */}
          <motion.button
            onClick={() => setShowModal(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="liquid-glass flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-medium mt-2"
          >
            <FileText size={15} />
            Generate Complaint Letter
          </motion.button>
        </motion.div>

        {/* RIGHT: Globe */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="liquid-glass rounded-2xl overflow-hidden flex flex-col"
        >
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <p className="text-white/40 text-xs tracking-widest uppercase">Supply Chain Map</p>
            <p className="text-white text-sm mt-0.5">{DEMO_REPORT.company} · {DEMO_REPORT.hqCountry}</p>
          </div>
          <div className="flex-1 min-h-0" style={{ minHeight: 400 }}>
            <Globe
              suppliers={DEMO_REPORT.suppliers}
              hqLat={DEMO_REPORT.hqLat}
              hqLng={DEMO_REPORT.hqLng}
            />
          </div>
          {/* Pin count summary */}
          <div className="px-4 pb-4 pt-2 flex-shrink-0 flex gap-3">
            {[
              { color: '#ef4444', label: 'Critical (5)', count: DEMO_REPORT.suppliers.filter(s => s.riskScore === 5).length },
              { color: '#f97316', label: 'High (4)', count: DEMO_REPORT.suppliers.filter(s => s.riskScore === 4).length },
              { color: '#f59e0b', label: 'Medium (3)', count: DEMO_REPORT.suppliers.filter(s => s.riskScore === 3).length },
              { color: '#22c55e', label: 'Low (1-2)', count: DEMO_REPORT.suppliers.filter(s => s.riskScore <= 2).length },
            ].filter(i => i.count > 0).map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                <span className="text-white/40 text-xs">{item.label}: {item.count}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </main>

      <Footer />

      {showModal && (
        <ComplaintModal company={DEMO_REPORT.company} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 pb-2">
      <span className="text-white/40">{icon}</span>
      <h2 className="text-white/80 text-sm font-medium tracking-wide">{title}</h2>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: 'urgent' | 'high' | 'medium' }) {
  const styles = {
    urgent: { color: '#ef4444', bg: '#ef444420', label: 'Urgent' },
    high: { color: '#f97316', bg: '#f9731620', label: 'High' },
    medium: { color: '#f59e0b', bg: '#f59e0b20', label: 'Medium' },
  }[priority];

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full h-fit flex-shrink-0 mt-0.5"
      style={{ color: styles.color, background: styles.bg }}
    >
      {styles.label}
    </span>
  );
}
