import React from 'react';
import { EcosystemCanvas } from './three/EcosystemCanvas';
import type { NodeKey } from '../types/nirog';

interface SubBannerProps {
  focusNode: NodeKey;
  eyebrow: string;
  title: string;
  lede: string;
  actions?: React.ReactNode;
}

export const SubBanner: React.FC<SubBannerProps> = ({ focusNode, eyebrow, title, lede, actions }) => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#03151c] to-[#072430] text-white border-b border-cyan-500/15">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-full md:w-3/5 opacity-60">
        <EcosystemCanvas
          selectedNode={focusNode}
          onSelectNode={() => {}}
          paused={false}
          zoomLevel={1.0}
          focusOnly={focusNode}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, #03151c 0%, rgba(3,21,28,0.92) 44%, rgba(3,21,28,0.45) 75%, rgba(3,21,28,0.15) 100%)',
        }}
      />
      <div className="relative z-10 max-w-[1280px] mx-auto px-5 py-10 md:py-12">
        <p className="text-xs font-mono uppercase tracking-wider text-cyan-300 mb-2">{eyebrow}</p>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold max-w-2xl text-white">{title}</h1>
        <p className="text-sm sm:text-base text-slate-300 max-w-2xl mt-3 leading-relaxed">{lede}</p>
        {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  );
};
