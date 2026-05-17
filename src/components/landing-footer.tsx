"use client";

import { motion } from "motion/react";
import { Music2, Share2, MessageCircle, Play, Camera } from "lucide-react";
import { LaborLensLogo } from "@/components/laborlens-brand";

const LINKS: Record<string, string[]> = {
  Discover: ["Overview", "How It Works", "Supply Chain Map", "Risk Index"],
  "The Mission": ["About LaborLens", "Research Partners", "Impact Reports", "Press"],
  Concierge: ["Request Analysis", "Enterprise API", "Legal Referrals", "Contact"],
};

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
      className="liquid-glass relative z-10 mt-auto"
      style={{ borderRadius: "1.5rem 1.5rem 0 0" }}
    >
      <div className="max-w-7xl mx-auto px-8 pt-10 pb-6">
        <div className="flex items-center gap-3 mb-8">
          <LaborLensLogo />
          <span className="text-white text-2xl font-light tracking-[0.3em] uppercase">
            LABORLENS
          </span>
        </div>

        <div className="laborlens-footer-grid grid grid-cols-3 gap-8 mb-10">
          {Object.entries(LINKS).map(([heading, items]) => (
            <div key={heading}>
              <p className="text-white/50 text-xs tracking-widest uppercase mb-3">
                {heading}
              </p>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-white/70 text-sm hover:text-white transition-colors duration-200"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="laborlens-footer-bottom border-t border-white/10 pt-5 flex items-center justify-between">
          <p className="text-white/30 text-xs">
            © 2026 LaborLens. Advancing labour rights through technology.
          </p>
          <div className="flex items-center gap-4">
            {[Music2, Share2, MessageCircle, Play, Camera].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="text-white/40 hover:text-white transition-colors duration-200"
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
