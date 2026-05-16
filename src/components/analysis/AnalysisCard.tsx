import { ReactNode } from 'react';
import { cn } from '../../App';

interface AnalysisCardProps {
  children: ReactNode;
  className?: string;
  key?: string | number;
}

export function AnalysisCard({ children, className }: AnalysisCardProps) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/40', className)}>
      {children}
    </div>
  );
}
