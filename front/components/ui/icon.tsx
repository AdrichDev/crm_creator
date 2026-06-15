'use client';
import * as Icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

// Render dinámico de un icono lucide por nombre (usado por el sidebar/módulos).
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name] ?? Icons.Square;
  return <Cmp {...props} />;
}
