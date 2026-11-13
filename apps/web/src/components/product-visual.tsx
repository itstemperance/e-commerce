'use client';

import React from 'react';
import {
  Cpu,
  Laptop,
  Headphones,
  Keyboard,
  Monitor,
  Mouse,
  HardDrive,
  CircuitBoard,
  MemoryStick,
  Cable,
  Mic,
  Sliders,
  Armchair,
  LampDesk,
  Server,
  Wifi,
  BatteryCharging,
  Radio,
  Gamepad2,
} from 'lucide-react';
import { ProductRetailMeta } from '@/lib/product-visuals';

export function ProductVisual({
  meta,
  isFlashSale,
  size = 'card',
}: {
  meta: ProductRetailMeta;
  isFlashSale?: boolean;
  size?: 'card' | 'detail' | 'thumb';
}) {
  const iconClass =
    size === 'detail'
      ? 'h-24 w-24 stroke-[1.3] text-white/90 drop-shadow-2xl'
      : size === 'thumb'
        ? 'h-7 w-7 stroke-[1.5] text-white/90'
        : 'h-14 w-14 stroke-[1.4] text-white/90 drop-shadow-lg group-hover:scale-110 transition-transform duration-500';

  function renderHardwareIcon() {
    switch (meta.iconType) {
      case 'gpu':
      case 'cpu':
        return <Cpu className={iconClass} />;
      case 'laptop':
        return <Laptop className={iconClass} />;
      case 'headphones':
        return <Headphones className={iconClass} />;
      case 'keyboard':
        return <Keyboard className={iconClass} />;
      case 'monitor':
        return <Monitor className={iconClass} />;
      case 'mouse':
        return <Mouse className={iconClass} />;
      case 'ssd':
        return <HardDrive className={iconClass} />;
      case 'motherboard':
        return <CircuitBoard className={iconClass} />;
      case 'ram':
        return <MemoryStick className={iconClass} />;
      case 'dock':
        return <Cable className={iconClass} />;
      case 'mic':
        return <Mic className={iconClass} />;
      case 'controller':
        return <Sliders className={iconClass} />;
      case 'chair':
      case 'desk':
        return <Armchair className={iconClass} />;
      case 'lightbar':
        return <LampDesk className={iconClass} />;
      case 'nas':
        return <Server className={iconClass} />;
      case 'router':
        return <Wifi className={iconClass} />;
      case 'powerbank':
        return <BatteryCharging className={iconClass} />;
      case 'dac':
        return <Radio className={iconClass} />;
      case 'handheld':
        return <Gamepad2 className={iconClass} />;
      default:
        return <Laptop className={iconClass} />;
    }
  }

  if (size === 'thumb') {
    return (
      <div
        className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${meta.accentColor} shadow-inner`}
      >
        {renderHardwareIcon()}
      </div>
    );
  }

  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br ${
        meta.accentColor
      } ${
        size === 'detail' ? 'h-80 sm:h-96 rounded-2xl' : 'h-48 rounded-xl'
      }`}
    >
      {/* Subtle studio radial spotlight */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.16),transparent_70%)]" />

      {/* Brand watermark */}
      <span className="pointer-events-none select-none absolute bottom-3 right-4 text-xs font-bold uppercase tracking-[0.2em] text-white/25">
        {meta.brand}
      </span>

      {/* Top badge */}
      {(isFlashSale || meta.badge) && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          {isFlashSale ? (
            <span className="inline-flex items-center rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
              ⚡ Limited Flash Deal
            </span>
          ) : (
            meta.badge && (
              <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-stone-900 shadow-sm">
                {meta.badge}
              </span>
            )
          )}
        </div>
      )}

      {/* Center hardware studio emblem */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          {renderHardwareIcon()}
        </div>
      </div>
    </div>
  );
}
