import { ReactNode } from 'react';
import { cn } from '../../App';
import { analysisCardTokens, dsSpacing } from './visualTokens';

interface AnalysisCardProps {
  children: ReactNode;
  className?: string;
  key?: string | number;
}

export function AnalysisCard({ children, className }: AnalysisCardProps) {
  return (
    <div className={cn(analysisCardTokens.base, dsSpacing.p6, className)}>
      {children}
    </div>
  );
}
