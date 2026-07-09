import DetailView from './detail-view';

// Wrapper de servidor: habilita `output: export` (exe/apk/ios) para esta ruta
// dinamica. La vista real ('use client') lee el `id` en runtime con useParams,
// asi que no se prerenderiza ningun id concreto; la navegacion cliente resuelve
// el detalle contra el backend. En dev/Vercel sigue siendo dinamica.
export function generateStaticParams(): { id: string }[] {
  // Semilla minima requerida por `output: export`; los ids reales se resuelven
  // en cliente (useParams) contra el backend, no se prerenderizan.
  return [{ id: 'placeholder' }];
}

export default function Page() {
  return <DetailView />;
}
