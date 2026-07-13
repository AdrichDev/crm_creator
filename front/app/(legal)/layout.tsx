import Link from 'next/link';
import styles from './legal.module.css';

// Wrapper de las páginas legales del CRM (públicas, sin auth ni chrome). Look oscuro
// tipo AA con colores fijos (independiente del tema claro/oscuro del CRM): header con
// wordmark, enlace de vuelta y pie con los dos documentos (OperaOS no lleva cookies).
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <Link href="/" aria-label="Ir al inicio" className={styles.brand}>
            3A Estudio
          </Link>
          <Link href="/" className={styles.back}>
            ← Volver al inicio
          </Link>
        </header>

        <div className={styles.panel}>
          <article className={styles.prose}>{children}</article>

          <footer className={styles.footer}>
            <nav className={styles.footerNav}>
              <Link href="/privacidad">Política de Privacidad</Link>
              <Link href="/aviso-legal">Aviso Legal</Link>
            </nav>
          </footer>
        </div>
      </div>
    </div>
  );
}
