'use client';

import { motion } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import { AGENTS, type AgentId } from '@/lib/demoData';

export type AgentStatus = 'pending' | 'running' | 'complete';

interface Props {
  statuses: Record<AgentId, AgentStatus>;
}

export default function AgentSwarm({ statuses }: Props) {
  return (
    <div className="liquid-glass rounded-2xl p-5 flex flex-col gap-3">
      <h2 className="text-white/50 text-xs tracking-widest uppercase mb-1">
        Agent Swarm
      </h2>
      {AGENTS.map((agent) => {
        const status = statuses[agent.id];
        return (
          <AgentRow key={agent.id} label={agent.label} description={agent.description} status={status} />
        );
      })}
    </div>
  );
}

function AgentRow({
  label,
  description,
  status,
}: {
  label: string;
  description: string;
  status: AgentStatus;
}) {
  return (
    <div className="flex items-center gap-3">
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium leading-tight">{label}</p>
        <p className="text-white/40 text-xs truncate">{description}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === 'complete') {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center flex-shrink-0"
      >
        <Check size={12} className="text-emerald-400" />
      </motion.div>
    );
  }

  if (status === 'running') {
    return (
      <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <Loader2 size={12} className="text-blue-400" />
        </motion.div>
        {/* Pulse ring */}
        <motion.div
          className="absolute w-7 h-7 rounded-full border border-blue-400/60"
          animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
      </div>
    );
  }

  return (
    <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
    </div>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === 'complete') {
    return <span className="text-emerald-400 text-xs">Done</span>;
  }
  if (status === 'running') {
    return (
      <motion.span
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-blue-400 text-xs"
      >
        Running
      </motion.span>
    );
  }
  return <span className="text-white/25 text-xs">Pending</span>;
}
