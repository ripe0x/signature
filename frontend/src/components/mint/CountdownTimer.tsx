'use client';

import { formatCountdown } from '@/lib/utils';

interface CountdownTimerProps {
  seconds: number;
  label?: string;
}

export function CountdownTimer({ seconds, label }: CountdownTimerProps) {
  const isUrgent = seconds > 0 && seconds < 300; // Less than 5 minutes

  return (
    <div className="text-center">
      {label && <div className="text-sm text-muted mb-2">{label}</div>}
      <div
        className={`text-4xl md:text-5xl font-mono tabular-nums ${
          isUrgent ? 'text-red-500' : ''
        }`}
      >
        {formatCountdown(seconds)}
      </div>
    </div>
  );
}
