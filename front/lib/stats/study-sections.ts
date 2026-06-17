import type { StudySection } from './study-types';

/**
 * Divide el contenido markdown del estudio en secciones editables usando los
 * encabezados de nivel 1-2 (`#` / `##`) como límites. Si no hay encabezados,
 * devuelve una única sección con todo el contenido.
 */
export function deriveSections(content: string): StudySection[] {
  const text = (content ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const sections: StudySection[] = [];
  let current: { title: string; body: string[] } | null = null;

  const slug = (s: string, i: number) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `seccion-${i}`;

  const flush = () => {
    if (!current) return;
    sections.push({
      key: slug(current.title, sections.length),
      title: current.title,
      markdown: current.body.join('\n').trim(),
      rating: null,
    });
    current = null;
  };

  for (const raw of lines) {
    const h = /^(#{1,2})\s+(.*)$/.exec(raw.trim());
    if (h) {
      flush();
      current = { title: h[2].replace(/[*_`]/g, '').trim(), body: [] };
    } else if (current) {
      current.body.push(raw);
    } else if (raw.trim()) {
      // Contenido antes del primer encabezado → sección "Resumen".
      current = { title: 'Resumen', body: [raw] };
    }
  }
  flush();

  if (sections.length === 0) {
    return [{ key: 'contenido', title: 'Contenido', markdown: text.trim(), rating: null }];
  }
  return sections;
}

/** Reconstruye el contenido markdown completo a partir de las secciones. */
export function sectionsToMarkdown(sections: StudySection[]): string {
  return sections
    .map((s) => `## ${s.title}\n\n${s.markdown}`.trim())
    .join('\n\n');
}
